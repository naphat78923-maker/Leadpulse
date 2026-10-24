"""Exercise the duplicate-accounts migration (merge, undo, Branch of, Not a duplicate) on real PostgreSQL.

Creates a temporary local cluster listening on 127.0.0.1 only; never connects to Supabase or an
existing server. The tables are scripts/fixtures/company-merge-schema.sql, column for column as
on live. Requires initdb, pg_ctl and psql in PATH.

    python3 scripts/test-company-duplicates-migration.py --scratch /path/to/scratch
"""
import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scratch', type=Path, required=True)
    parser.add_argument('--port', default='55444')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    for tool in ('initdb', 'pg_ctl', 'psql'):
        if not shutil.which(tool):
            raise SystemExit(f'Missing local PostgreSQL tool: {tool}')
    args.scratch.mkdir(parents=True, exist_ok=True)
    schema = (root / 'scripts/fixtures/company-merge-schema.sql').read_text()
    checks = root / 'scripts/fixtures/company-merge-checks.sql'
    migration = (root / 'supabase/migrations/20261025120000_company_duplicates.sql').read_text()
    with tempfile.TemporaryDirectory(prefix='pg-dupes-', dir=args.scratch) as directory:
        folder = Path(directory)
        data = folder / 'data'
        def run(command, **kwargs):
            # macOS can initialize locale lookup threads before postgres forks.
            # A process-local C locale keeps the isolated server startup safe.
            return subprocess.run(command, capture_output=True, text=True, timeout=60,
                                  env={**os.environ, 'LC_ALL': 'C'}, **kwargs)
        init = run(['initdb', '-D', str(data), '-A', 'trust', '-U', 'postgres', '--no-locale', '--encoding=UTF8'])
        assert init.returncode == 0, init.stderr
        pg = ['pg_ctl', '-D', str(data)]
        started = False
        try:
            # TCP on loopback: a Unix socket path under a long scratch folder exceeds the 103-byte limit.
            start = run(pg + ['-l', str(folder / 'server.log'), '-o', f"-F -k '' -p {args.port} -c listen_addresses=127.0.0.1", '-w', 'start'])
            assert start.returncode == 0, start.stdout + start.stderr + (folder / 'server.log').read_text()
            started = True
            psql = ['psql', '-X', '-h', '127.0.0.1', '-p', args.port, '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1']
            def sql(statement, succeeds=True):
                result = run(psql, input=statement)
                if succeeds:
                    assert result.returncode == 0, result.stdout + result.stderr
                else:
                    assert result.returncode != 0, 'Expected SQL rejection'
                return result
            sql(schema)
            sql("insert into companies (name) values ('Fixture before migration'); insert into contacts (name) values ('Fixture person');")
            snapshot = "select json_agg(to_jsonb(t) - 'parent_company_id' order by id)::text from companies t;"
            before = sql(snapshot).stdout
            sql(migration)
            assert sql(snapshot).stdout == before, 'Migration changed existing records'
            sql(migration)  # idempotent

            merged = run(psql + ['-f', str(checks)])
            assert merged.returncode == 0 and 'undo ok' in merged.stdout, merged.stdout + merged.stderr

            merge_id = sql("select id from company_merges order by merged_at desc limit 1;").stdout.strip()
            again = sql(f"set role anon; select unmerge_companies('{merge_id}');", succeeds=False)
            assert 'already undone' in again.stderr, again.stderr
            same = sql("set role anon; select merge_companies('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');", succeeds=False)
            assert 'two different accounts' in same.stderr, same.stderr
            assert sql('set role anon; select count(*) from company_merges;').stdout.strip().splitlines()[-1] == '0', 'Merge log readable with the app key'

            # Not a duplicate: one row per pair, smaller id first; the app key adds and removes it.
            sql("set role anon; insert into company_duplicate_dismissals (company_a, company_b) values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');")
            sql("set role anon; insert into company_duplicate_dismissals (company_a, company_b) values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111');", succeeds=False)
            sql("set role anon; delete from company_duplicate_dismissals;")
            assert sql('select count(*) from company_duplicate_dismissals;').stdout.strip() == '0'

            # Branch of: an account cannot be its own main account.
            self_parent = sql("update companies set parent_company_id = id where id = '44444444-4444-4444-4444-444444444444';", succeeds=False)
            assert 'companies_parent_not_self' in self_parent.stderr, self_parent.stderr

            print(json.dumps({
                'postgresql_migration_test': 'passed',
                'existing_rows_preserved': True,
                'idempotent': True,
                'merge_moves_fills_and_archives': True,
                'undo_restores_and_keeps_later_edits': True,
                'second_undo_rejected': True,
                'merge_log_closed_to_app_key': True,
                'dismissals_one_row_per_pair': True,
                'parent_not_self': True,
                'live_database_touched': False,
            }, indent=2))
        finally:
            if started or (data / 'postmaster.pid').exists():
                stop = run(pg + ['-m', 'fast', '-w', 'stop'])
                assert stop.returncode == 0, stop.stdout + stop.stderr


if __name__ == '__main__':
    main()
