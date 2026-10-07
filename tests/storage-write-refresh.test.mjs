import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request } from './helpers/worker.mjs';

const path = `/${UUID}/api/config`;
const post = body => ({ method: 'POST', body: JSON.stringify(body) });

test('sequential saves from two warm isolates retain earlier completed changes', async t => {
  const first = await loadWorker(t);
  const second = await loadWorker(t);
  const C = mockKV({ yx: 'old.example:443' });
  const env = environment({ C });
  for (const { worker } of [first, second]) {
    assert.equal((await request(worker, env, path)).status, 200);
  }

  assert.equal((await request(first.worker, env, path, post({ yx: 'new.example:443' }))).status, 200);
  const readsBeforeSecondSave = C.reads.length;
  assert.equal((await request(second.worker, env, path, post({ alpn: 'h2' }))).status, 200);

  assert.ok(C.reads.slice(readsBeforeSecondSave).includes('c'), 'saving must read the complete configuration');
  assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'new.example:443', alpn: 'h2' });
});

test('saving refreshes the complete configuration even when the version key is unchanged', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV({ yx: 'old.example:443' });
  const env = environment({ C });
  assert.equal((await request(worker, env, path)).status, 200);
  // Another writer saved c while its c_ver publication failed. Ordinary reads
  // may keep the old snapshot, but a partial save must merge the complete c.
  C.data.set('c', JSON.stringify({ yx: 'new.example:443' }));
  advanceTime(30_000);
  const readsBeforeSave = C.reads.length;
  assert.equal((await request(worker, env, path, post({ alpn: 'h2' }))).status, 200);
  assert.ok(C.reads.slice(readsBeforeSave).includes('c'));
  assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'new.example:443', alpn: 'h2' });
});

for (const failure of ['unavailable', 'malformed', 'array', 'null', 'scalar']) {
  test(`a healthy cached snapshot cannot authorize a partial save when fresh c is ${failure}`, async t => {
    const { worker } = await loadWorker(t);
    const initial = { yx: 'cached.example:443' };
    const C = mockKV(initial);
    const env = environment({ C });
    assert.equal((await request(worker, env, path)).status, 200);

    const get = C.get.bind(C);
    if (failure === 'unavailable') {
      C.get = async key => {
        if (key === 'c') throw new Error('fixture configuration outage');
        return get(key);
      };
    } else {
      C.data.set('c', { malformed: '{bad', array: '[]', null: 'null', scalar: '123' }[failure]);
    }
    const unreadable = C.data.get('c');
    assert.equal((await request(worker, env, path, post({ alpn: 'h2' }))).status, 500);
    assert.deepEqual(C.writes, []);
    assert.equal(C.data.get('c'), unreadable);
    assert.equal((await (await request(worker, env, path)).json()).yx, initial.yx);

    C.get = get;
    C.data.set('c', JSON.stringify({ yx: 'recovered.example:443' }));
    assert.equal((await request(worker, env, path, post({ alpn: 'h2' }))).status, 200);
    assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'recovered.example:443', alpn: 'h2' });
  });
}
