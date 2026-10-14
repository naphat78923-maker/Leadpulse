"""Exercise the proposed migration against isolated, real PostgreSQL.

Creates a temporary local cluster with Unix-socket-only access, never connects
 to Supabase or an existing server. Requires initdb, pg_ctl and psql in PATH.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scratch', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for tool in ('initdb', 'pg_ctl', 'psql'):
        if not shutil.which(tool):
            raise SystemExit(f'Missing local PostgreSQL tool: {tool}')
    args.scratch.mkdir(parents=True, exist_ok=True)
    baseline = subprocess.run(['git', 'show', 'HEAD:scripts/setup-supabase.sql'], cwd=root, check=True, capture_output=True, text=True).stdout
    match = re.search(r'CREATE TABLE IF NOT EXISTS contacts \([\s\S]*?^\);', baseline, re.MULTILINE)
    assert match, 'Cannot find baseline contacts table'
    migration = (root / 'supabase/migrations/20261013000000_contact_uncontacted_status.sql').read_text()
    with tempfile.TemporaryDirectory(prefix='pg-status-', dir=args.scratch) as directory:
        folder = Path(directory)
        data = folder / 'data'
        socket = folder / 'sock'
        socket.mkdir(mode=0o700)
        port = '55443'
        def run(command, **kwargs):
            # macOS can initialize locale lookup threads before postgres forks.
            # A process-local C locale keeps the isolated server startup safe.
            return subprocess.run(command, capture_output=True, text=True, timeout=60,
                                  env={**os.environ, 'LC_ALL': 'C'}, **kwargs)
        init = run(['initdb', '-D', str(data), '-A', 'trust', '--no-locale', '--encoding=UTF8'])
        assert init.returncode == 0, init.stderr
        pg = ['pg_ctl', '-D', str(data)]
        started = False
        try:
            start = run(pg + ['-l', str(folder / 'server.log'), '-o', f"-F -k {socket} -p {port} -c listen_addresses=''", '-w', 'start'])
            assert start.returncode == 0, start.stdout + start.stderr + (folder / 'server.log').read_text()
            started = True
            def sql(statement, succeeds=True):
                result = run(['psql', '-X', '-h', str(socket), '-p', port, '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], input=statement)
                if succeeds:
                    assert result.returncode == 0, result.stdout + result.stderr
                else:
                    assert result.returncode != 0, 'Expected SQL rejection'
                return result
            sql('CREATE EXTENSION "uuid-ossp"; CREATE TABLE companies(id uuid PRIMARY KEY); ' + match.group())
            before_default = sql("INSERT INTO contacts(name) VALUES ('Fixture default before migration') RETURNING status;").stdout
            assert before_default.splitlines()[0] == 'active', before_default
            old_statuses = ['active', 'replied', 'not_interested', 'no_response', 'parked']
            for status in old_statuses:
                sql(f"INSERT INTO contacts(name,status,notes) VALUES ('Fixture {status}','{status}','Unchanged historical fixture');")
            snapshots = sql('SELECT json_agg(t ORDER BY id)::text FROM contacts t;').stdout
            sql(migration)
            assert sql('SELECT json_agg(t ORDER BY id)::text FROM contacts t;').stdout == snapshots, 'Migration changed existing records'
            default = sql("INSERT INTO contacts(name) VALUES ('Fixture default after migration') RETURNING status;").stdout
            assert default.splitlines()[0] == 'uncontacted', default
            neutral = sql("INSERT INTO contacts(name,status) VALUES ('Fixture explicit neutral','uncontacted') RETURNING status;").stdout
            assert neutral.splitlines()[0] == 'uncontacted', neutral
            bad = sql("INSERT INTO contacts(name,status) VALUES ('Fixture invalid','bogus');", succeeds=False)
            assert 'contacts_status_check' in bad.stderr, bad.stderr
            null = sql("INSERT INTO contacts(name,status) VALUES ('Fixture null',NULL);", succeeds=False)
            assert 'not-null constraint' in null.stderr, null.stderr
            repeat_before = sql('SELECT json_agg(t ORDER BY id)::text FROM contacts t;').stdout
            sql(migration)
            assert sql('SELECT json_agg(t ORDER BY id)::text FROM contacts t;').stdout == repeat_before
            sql('ALTER TABLE contacts ADD CONSTRAINT unexpected_status_check CHECK (length(status) > 0);')
            unexpected = sql(migration, succeeds=False)
            assert 'Unexpected contacts.status constraints' in unexpected.stderr, unexpected.stderr
            assert sql('SELECT json_agg(t ORDER BY id)::text FROM contacts t;').stdout == repeat_before
            print(json.dumps({'postgresql_migration_test': 'passed', 'baseline_default': 'active', 'new_default': 'uncontacted', 'existing_rows_preserved': len(json.loads(snapshots)), 'explicit_uncontacted_accepted': True, 'invalid_and_null_status_rejected': True, 'idempotent': True, 'unexpected_schema_rejected_without_record_changes': True, 'live_database_touched': False}, indent=2))
        finally:
            if started or (data / 'postmaster.pid').exists():
                stop = run(pg + ['-m', 'fast', '-w', 'stop'])
                assert stop.returncode == 0, stop.stdout + stop.stderr


if __name__ == '__main__':
    main()
