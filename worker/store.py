"""SQLite is the single-worker queue and durable usage ledger, not an offline app cache."""
from __future__ import annotations
import hashlib
import json
import sqlite3
import time
from datetime import datetime
from zoneinfo import ZoneInfo

ACTIVE=('queued', 'running', 'stopping')


class Rejected(Exception):
    def __init__(self, code, status=409): self.code=code; self.status=status


class Store:
    def __init__(self, settings, clock=time.time):
        self.settings=settings; self.clock=clock
        settings.data.mkdir(parents=True, exist_ok=True)
        settings.data.chmod(0o700)
        self.db=sqlite3.connect(settings.data/'research.sqlite3', isolation_level=None)
        self.db.row_factory=sqlite3.Row
        self.db.execute('pragma journal_mode=wal')
        self.db.executescript('''
          create table if not exists jobs (
            id text primary key, owner_id text not null, fingerprint text not null,
            day text not null, created_at real not null, updated_at real not null,
            status text not null, scope_project_id text, payload text not null);
          create index if not exists jobs_owner on jobs(owner_id,created_at desc);
          create unique index if not exists one_active_owner on jobs(owner_id)
            where status in ('queued','running','stopping');
        ''')

    def day(self): return datetime.fromtimestamp(self.clock(), ZoneInfo('Africa/Johannesburg')).date().isoformat()

    @staticmethod
    def fingerprint(payload): return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

    def get(self, id, owner=None):
        row=self.db.execute('select * from jobs where id=?', (id,)).fetchone()
        if not row or (owner is not None and row['owner_id']!=owner): raise Rejected('job_not_found', 404)
        job=json.loads(row['payload']); job.update(id=row['id'], owner_id=row['owner_id'], status=row['status'], scope_project_id=row['scope_project_id'], created_at=row['created_at'])
        return job

    def existing(self, payload, owner):
        row=self.db.execute('select owner_id,fingerprint from jobs where id=?', (payload['id'],)).fetchone()
        if not row: return None
        if row['owner_id']!=owner: raise Rejected('job_not_found', 404)
        if row['fingerprint']!=self.fingerprint(payload): raise Rejected('id_conflict')
        return self.get(payload['id'], owner)

    def usage(self, owner):
        member=self.db.execute('select count(*) from jobs where day=? and owner_id=?', (self.day(),owner)).fetchone()[0]
        total=self.db.execute('select count(*) from jobs where day=?', (self.day(),)).fetchone()[0]
        return {'member_runs':member,'member_limit':self.settings.member_daily,'global_runs':total,'global_limit':self.settings.global_daily,'reset_zone':'Africa/Johannesburg'}

    def create(self, payload, owner):
        self.db.execute('begin immediate')
        try:
            existing=self.existing(payload,owner)
            if existing: self.db.execute('commit'); return existing
            usage=self.usage(owner)
            if usage['member_runs']>=self.settings.member_daily or usage['global_runs']>=self.settings.global_daily: raise Rejected('quota_reached',429)
            if self.db.execute("select 1 from jobs where owner_id=? and status in ('queued','running','stopping')",(owner,)).fetchone(): raise Rejected('active_job')
            if self.db.execute("select count(*) from jobs where status in ('queued','running','stopping')").fetchone()[0]>=self.settings.queue_limit: raise Rejected('queue_full',429)
            timestamp=self.clock()
            job={**payload,'owner_id':owner,'status':'queued','stage':'Waiting for browser','created_at':timestamp,'calls':0,'input_tokens':0,'output_tokens':0,'sources':[],'events':[],'result':'','message':''}
            self.db.execute('insert into jobs values(?,?,?,?,?,?,?,?,?)',(payload['id'],owner,self.fingerprint(payload),self.day(),timestamp,timestamp,'queued',payload.get('scope_project_id'),json.dumps(job)))
            self.db.execute('commit'); return job
        except BaseException:
            self.db.execute('rollback'); raise

    def put(self, job):
        current=self.get(job['id'])
        if current['status']=='stopping' and job['status'] not in ('cancelled','failed'): job={**job,'status':'stopping','stage':'Stopping browser…'}
        self.db.execute('update jobs set status=?,updated_at=?,payload=? where id=?',(job['status'],self.clock(),json.dumps(job),job['id']))

    def latest(self, owner):
        row=self.db.execute('select id from jobs where owner_id=? order by created_at desc,rowid desc limit 1',(owner,)).fetchone()
        return row['id'] if row else None

    def next(self):
        row=self.db.execute("select id from jobs where status='queued' order by created_at,rowid limit 1").fetchone()
        if not row: return None
        job=self.get(row['id']);job.update(status='running',stage='Opening public websites');self.put(job);return job

    def stop(self, id, owner):
        job=self.get(id,owner)
        if job['status'] in ACTIVE:
            job.update(status='cancelled' if job['status']=='queued' else 'stopping', stage='Cancelled' if job['status']=='queued' else 'Stopping browser…')
            self.put(job)
        return self.get(id,owner)

    def recover(self):
        for row in self.db.execute("select id from jobs where status in ('queued','running','stopping')").fetchall():
            job=self.get(row['id']);job.update(status='cancelled',stage='Worker restarted',message='This run was interrupted. Start a new run when ready; it was not restarted automatically.');self.put(job)

    def prune(self):
        self.db.execute("delete from jobs where created_at<? and status not in ('queued','running','stopping')",(self.clock()-self.settings.retention_days*86400,))

    def close(self): self.db.close()
