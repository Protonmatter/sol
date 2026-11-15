"""Local Git fixtures, deliberately isolated from credentials and the network."""
import os
import subprocess
import tempfile
from pathlib import Path

def git(repo, *args, input=None, check=True):
    result = subprocess.run(['git', '-C', str(repo), *args], input=input,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=check,
        env={**os.environ, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': os.devnull,
             'GIT_AUTHOR_NAME': 'Fixture', 'GIT_AUTHOR_EMAIL': 'fixture@example.invalid',
             'GIT_COMMITTER_NAME': 'Fixture', 'GIT_COMMITTER_EMAIL': 'fixture@example.invalid'})
    return result.stdout.decode().strip() if check else result

class LocalRepo:
    def __init__(self, root=None):
        self.temp = tempfile.TemporaryDirectory() if root is None else None
        self.root = Path(self.temp.name) if self.temp else root
        self.repo = self.root / 'checkout'; self.repo.mkdir()
        git(self.repo, 'init', '-b', 'master')
        (self.repo / 'keep.txt').write_bytes(b'unchanged\n')
        (self.repo / 'remove.txt').write_bytes(b'to delete\n')
        git(self.repo, 'add', '.'); git(self.repo, 'commit', '-m', 'base')
        self.base = git(self.repo, 'rev-parse', 'HEAD')
        self.remote = self.root / 'remote.git'
        git(self.root, 'clone', '--bare', str(self.repo), str(self.remote))
        git(self.repo, 'switch', '-c', 'feature')
        self.binary = bytes(range(256)) * 6554
        (self.repo / 'texture.bin').write_bytes(self.binary)
        (self.repo / 'remove.txt').unlink()
        (self.repo / 'file name.txt').write_bytes(b'example\n')
        git(self.repo, 'add', '-A'); git(self.repo, 'commit', '-m', 'candidate')
        self.candidate = git(self.repo, 'rev-parse', 'HEAD')
        self.paths = ['file name.txt', 'remove.txt', 'texture.bin']
    def close(self):
        if self.temp: self.temp.cleanup()
