import { normalizeAiRequest, reservationUpdate, refundUpdate, parseAiJson } from './base44/shared/aiPolicy.js';
import { executePaidAi } from './base44/shared/aiOperations.js';
import { loadEnergyAccount } from './base44/shared/energy.js';
import { runProtectedAi, paidCoordinateSearch } from './base44/shared/paidAiRequest.js';
import { readFileSync, readdirSync } from 'node:fs';

const clone = value => structuredClone(value);
const at = (row, key) => key.split('.').reduce((v, k) => v?.[k], row);
function matches(row, query) {
  return Object.entries(query).every(([key, value]) => {
    const actual = at(row, key);
    if (value === null) return actual == null;
    if (value && typeof value === 'object') {
      if ('$gte' in value) return Number(actual || 0) >= value.$gte;
      if ('$exists' in value) return (actual !== undefined) === value.$exists;
    }
    return actual === value;
  });
}
function harness({balance = 20, fail = false, ambiguousSuccess = false} = {}) {
  const account = {id: 'a1', user_id: 'u1', narration: balance, manifestation: balance, aura_narration: 0, aura_manifestation: 0, ai_lock: null};
  const rows = [], files = new Map();
  let providerCalls = 0, accountWrites = 0, lost = false;
  const entity = {
    filter: async (query, options) => {const items = rows.filter(r => matches(r, query)).map(clone); return options ? {items} : items;},
    create: async data => {const row = {id: `r${rows.length + 1}`, ...clone(data)}; rows.push(row); return clone(row);},
    update: async (id, fields) => {const row = rows.find(r => r.id === id); Object.assign(row, clone(fields)); if (ambiguousSuccess && fields.status === 'succeeded' && !lost) {lost = true; throw new Error('lost acknowledgement');} return clone(row);},
  };
  const client = {asServiceRole: {entities: {
    EnergyAccount: {
      filter: async query => matches(account, query) ? [clone(account)] : [],
      updateMany: async (query, update) => {
        if (!matches(account, query)) return {updated: 0};
        accountWrites++;
        for (const [key, amount] of Object.entries(update.$inc || {})) account[key] = (account[key] || 0) + amount;
        Object.assign(account, clone(update.$set || {}));
        return {updated: 1};
      },
    },
    AiOperation: entity,
    User: {get: async () => ({}), update: async () => ({})},
  }, integrations: {Core: {
    InvokeLLM: async () => {providerCalls++; await new Promise(r => setTimeout(r, 4)); if (fail) throw new Error('provider unavailable'); return {answer: 'result'};},
    GenerateSpeech: async () => {providerCalls++; if (fail) throw new Error('provider unavailable'); return {url: 'https://example.test/result.mp3'};},
    UploadPrivateFile: async ({file}) => {const uri = `private:${files.size}`; files.set(uri, await file.text()); return {file_uri:uri};},
    CreateFileSignedUrl: async ({file_uri}) => ({signed_url: `data:application/json,${encodeURIComponent(files.get(file_uri))}`}),
  }}}};
  const user = {id: 'u1', role: 'user'};
  const entitlement = {isAdmin: false, genericAllowed: true, googleAllowed: false};
  const request = normalizeAiRequest({kind: 'generation', request_id:'request_123456789', input: {prompt: 'Return valid JSON'}, expect_json:true});
  return {client, account, rows, user, entitlement, request, calls: () => providerCalls, writes: () => accountWrites,
    run: (id='request_123456789', hash='h1', overrides={}) => executePaidAi(client, user, entitlement, request, id, hash, overrides)};
}
async function reason(fn) {try {await fn(); return 'allowed';} catch(e) {return e.reason || e.message;}}
export async function verifyPaidAi(check) {
  console.log('\n── Paid AI server operation checks (isolated, no live balances) ──');
  const narration = normalizeAiRequest({kind:'narration', request_id:'request_123456789', cost: 1, input:{text:'x'.repeat(101)}});
  check('narration cost is derived from text, not client cost', narration.cost, 3);
  check('empty narration rejected', await reason(() => normalizeAiRequest({kind:'narration',request_id:'request_123456789',input:{text:''}})), 'invalid_narration_text');
  check('oversized narration rejected before charging', await reason(() => normalizeAiRequest({kind:'narration',request_id:'request_123456789',input:{text:'x'.repeat(5001)}})), 'invalid_narration_text');
  check('invalid id rejected', await reason(() => normalizeAiRequest({request_id:'short'})), 'invalid_request_id');
  check('arbitrary provider model rejected', await reason(() => normalizeAiRequest({kind:'generation',request_id:'request_123456789',input:{prompt:'hi',model:'expensive-model'}})), 'invalid_model');
  check('LLM cost is fixed on server', normalizeAiRequest({kind:'generation',request_id:'request_123456789',cost:0,input:{prompt:'hi'}}).cost, 1);
  check('JSON fences are validated server-side', parseAiJson('```json\n{"ok":true}\n```').ok, true);
  check('malformed JSON is rejected', await reason(() => parseAiJson('not json')), 'invalid_ai_result');
  const lock = {token:'server-token',charge:[{field:'narration',amount:2},{field:'aura_narration',amount:1}]};
  const reserve = reservationUpdate({id:'a1'},lock.charge,lock);
  check('all pools are in one atomic reservation', reserve.update.$inc, {narration:-2,aura_narration:-1});
  check('reservation guards every required pool', [reserve.query.narration.$gte,reserve.query.aura_narration.$gte], [2,1]);
  check('reservation claims mutex in same update', reserve.update.$set.ai_lock.token, 'server-token');
  check('refund requires original execution token', refundUpdate('a1',lock).query['ai_lock.token'], 'server-token');
  check('refund uses exact recorded pools', refundUpdate('a1',lock).update.$inc, {narration:2,aura_narration:1});
  const success = harness();
  await success.run();
  check('successful generation costs exactly one unit', success.account.manifestation, 19);
  await success.run();
  check('same-id replay never invokes provider twice', success.calls(), 1);
  check('same-id replay never charges twice', success.account.manifestation, 19);
  check('changed input under same id rejected', await reason(() => success.run('request_123456789','other-input')), 'request_id_conflict');
  const parallel = harness();
  await Promise.allSettled([parallel.run(),parallel.run()]);
  check('concurrent duplicate invokes provider once', parallel.calls(), 1);
  check('concurrent duplicate debits once', parallel.account.manifestation, 19);
  const broke = harness({balance:0});
  check('insufficient funds refuse operation', await reason(() => broke.run()), 'insufficient');
  check('insufficient funds never invoke provider', broke.calls(), 0);
  check('insufficient funds never mutate account', broke.writes(), 0);
  const failed = harness({fail:true});
  check('provider failure returns refund outcome', await reason(() => failed.run()), 'operation_failed_refunded');
  check('provider failure restores original balance', failed.account.manifestation, 20);
  await reason(() => failed.run());
  check('failed replay never invokes provider twice', failed.calls(), 1);
  check('failed replay cannot refund twice', failed.account.manifestation, 20);
  const uncertain = harness({ambiguousSuccess:true});
  check('lost success acknowledgement is recoverable', await reason(() => uncertain.run()), 'result_temporarily_unavailable');
  await uncertain.run();
  check('durable success is not refunded or recharged', uncertain.account.manifestation, 19);
  check('lost response replay does not regenerate', uncertain.calls(), 1);
  const stale = harness();
  stale.account.manifestation = 19;
  stale.account.ai_lock = {token:'old',request_id:'interrupted_123456',payload_hash:'old-hash',kind:'generation',started_at:Date.now()-11*60000,charge:[{field:'manifestation',amount:1}]};
  stale.rows.push({id:'old-row',user_id:'u1',request_id:'interrupted_123456',payload_hash:'old-hash',kind:'generation',status:'pending'});
  check('interrupted operation is refunded on retry', await reason(() => stale.run('interrupted_123456','old-hash')), 'operation_interrupted_refunded');
  check('interrupted reservation restored once', stale.account.manifestation, 20);
  check('interrupted operation never repeats provider', stale.calls(), 0);
  const isolated = harness();
  isolated.user.id = 'someone-else';
  check('another user cannot spend the account', await reason(() => isolated.run()), 'energy_reconciliation_required');
  check('cross-account attempt never invokes provider', isolated.calls(), 0);
  let mutations = 0;
  const migrationClient = {asServiceRole:{entities:{EnergyAccount:{filter:async()=>[],create:async()=>{mutations++;}},User:{update:async()=>{mutations++;}}}}};
  check('migration stops rather than reducing balances', await reason(() => loadEnergyAccount(migrationClient,{id:'u1',aura_save_energy:5},{ceilings:{},marker:'m',ledgerUnavailable:false})), 'energy_reconciliation_required');
  check('rejected migration makes no balance writes', mutations, 0);
  const sourceFiles = dir => readdirSync(dir,{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : /\.[jt]sx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []);
  const direct = sourceFiles('src').filter(path => !path.endsWith('/DeveloperDocs.jsx') && /base44\.integrations\.Core\.(InvokeLLM|GenerateSpeech)\s*\(/.test(readFileSync(path,'utf8')));
  check('no frontend direct paid AI integration calls remain', direct, []);
  check('AI receipts have admin-only writes', JSON.parse(readFileSync('base44/entities/AiOperation.jsonc','utf8')).rls.update.user_condition.role, 'admin');
  check('paid AI never imports mutable user balances', readFileSync('base44/shared/aiOperations.js','utf8').includes('loadEnergyAccount('), false);
  const directBackend = sourceFiles('base44').filter(path => !path.endsWith('/aiOperations.js') && /(?:integrations\.Core|core)\.(InvokeLLM|GenerateSpeech)\s*\(/.test(readFileSync(path,'utf8')));
  check('no backend paid AI calls bypass reservation executor', directBackend, []);
  const requestBody = {kind:'generation',request_id:'request_123456789',input:{prompt:'hi'},expect_json:true};
  const noPlan = harness();
  noPlan.client.asServiceRole.entities.RevenueCatPurchase = {filter: async () => []};
  check('real gateway rejects forged plan without ledger', await reason(() => runProtectedAi(noPlan.client,{id:'u1',role:'user',plan:'trailblazer'},requestBody)), 'plan');
  check('forged plan refusal never invokes provider', noPlan.calls(), 0);
  const down = harness();
  down.client.asServiceRole.entities.RevenueCatPurchase = {filter: async () => {throw new Error('ledger unavailable');}};
  check('real gateway rejects unreadable entitlement without mutation', await reason(() => runProtectedAi(down.client,{id:'u1',role:'user'},requestBody)), 'entitlement_unavailable');
  check('unreadable entitlement has no account writes', down.writes(), 0);
  const coordinate = harness();
  coordinate.client.asServiceRole.entities.RevenueCatPurchase = {filter:async()=>[]};
  check('coordinate AI fallback cannot bypass entitlement', await reason(() => paidCoordinateSearch(coordinate.client,{id:'u1',role:'user'},{prompt:'Find exact coordinates'})), 'plan');
  check('blocked coordinate fallback never invokes provider', coordinate.calls(), 0);
  const paid = harness();
  paid.client.asServiceRole.entities.RevenueCatPurchase = {filter:async()=>[{user_id:'u1',product_id:'com.ages.explorer.explorer.monthly',store:'APP_STORE',status:'active',plan_expiration_date:'2099-01-01T00:00:00Z'}]};
  await runProtectedAi(paid.client,{id:'u1',role:'user'},requestBody);
  check('real gateway accepts a verified active subscriber', paid.calls(), 1);
  check('real gateway reserves the required energy', paid.account.manifestation, 19);
  const seeker = harness();
  seeker.account.narration = 0;
  seeker.account.aura_narration = 20;
  seeker.client.asServiceRole.entities.RevenueCatPurchase = {filter:async()=>[{user_id:'u1',product_id:'com.ages.explorer.seeker.monthly',store:'APP_STORE',status:'active',plan_expiration_date:'2099-01-01T00:00:00Z'}]};
  check('seeker cannot bypass generation tier', await reason(() => runProtectedAi(seeker.client,{id:'u1',role:'user'},requestBody)), 'plan');
  await runProtectedAi(seeker.client,{id:'u1',role:'user'},{kind:'narration',request_id:'narration_123456789',input:{text:'short narration'}});
  check('paid rollover narration remains available after tier change', seeker.account.aura_narration, 19);
  const admin = harness();
  admin.client.asServiceRole.entities.RevenueCatPurchase = {filter:async()=>[]};
  await runProtectedAi(admin.client,{id:'u1',role:'admin'},requestBody);
  check('admin AI access retains zero charge', admin.account.manifestation, 20);
}