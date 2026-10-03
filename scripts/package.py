"""Build reviewed ZIPs with a fixed file inventory and no personal filesystem metadata."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import shutil
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent.parent


def checked_path(name):
    rel = PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts or '\\' in name or ':' in name:
        raise ValueError(f'Unsafe inventory path: {name}')
    path = ROOT.joinpath(*rel.parts)
    if not path.resolve().is_relative_to(ROOT) or any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError(f'Unsafe source file: {name}')
    if not path.is_file():
        raise ValueError(f'Missing reviewed file: {name}')
    return path


def archive(output, names):
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as z:
        for name in sorted(names):
            info = ZipInfo(name, date_time=(2026, 10, 3, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = ZIP_DEFLATED
            z.writestr(info, checked_path(name).read_bytes(), compresslevel=9)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    inventory = json.loads((ROOT / 'scripts/package-files.json').read_text(encoding='utf-8'))
    runtime = inventory['runtime']
    source = inventory['source']
    if len(set(runtime)) != len(runtime) or len(set(source)) != len(source) or not set(runtime).issubset(source):
        raise ValueError('Invalid or duplicate package inventory')
    for name in source:
        checked_path(name)
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=True)
    version = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))['version']
    names = [f'Domain_Notes_Firefox_AMO_v{version}.zip', f'Domain_Notes_Firefox_Source_v{version}.zip']
    archive(out / names[0], runtime)
    archive(out / names[1], source)
    # This staging area contains only inventory files; never copy a browser profile.
    stage = out / 'amo'
    if stage.exists():
        existing = {p.relative_to(stage).as_posix() for p in stage.rglob('*') if p.is_file()}
        if existing - set(runtime):
            raise ValueError('AMO staging contains unreviewed files; choose a fresh output directory')
    for name in runtime:
        dest = stage / name
        if dest.exists() and dest.is_symlink():
            raise ValueError('AMO staging contains a symbolic link')
        if any(p.is_symlink() for p in [stage, *dest.parents]):
            raise ValueError('AMO staging contains a symbolic-link directory')
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(checked_path(name), dest)
    lines = [f'{hashlib.sha256((out / name).read_bytes()).hexdigest()}  {name}' for name in names]
    (out / 'SHA256SUMS.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Built {len(runtime)} runtime files and {len(source)} source files.')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
