/**
 * Build de produção com o endereço do backend vindo do `.env`.
 *
 * O Angular 17 não lê `.env`. Este script carrega o arquivo, deixa a variável de
 * ambiente de mesmo nome vencer (a Vercel sobrepõe assim) e roda o target
 * `build` com a opção `define`, que troca o identificador `API_URL` pelo texto
 * no bundle — ver `src/app/lembretes/lembretes.config.ts`.
 *
 * Por que a API do architect e não `ng build --define`: no Angular 17.3 o
 * `define` existe no builder, mas a CLI ainda não aceita opção de objeto na
 * linha de comando ("Unknown argument: define"). O architect é o mesmo motor
 * que o `ng` usa por dentro, e recebe o override sem tocar no angular.json.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('..', import.meta.url));
// Os pacotes do devkit são CommonJS sem `exports`; `import` de `.../node` falha
// com ERR_UNSUPPORTED_DIR_IMPORT.
const require = createRequire(import.meta.url);

// Lido antes do arquivo: o ambiente é quem vence, sem depender de como o Node
// trata chave repetida.
const doAmbiente = process.env.API_URL;
try {
  process.loadEnvFile(`${raiz}.env`);
} catch (erro) {
  if (erro.code !== 'ENOENT') throw erro;
}
const bruto = (doAmbiente ?? process.env.API_URL ?? '').trim();

let url;
try {
  url = new URL(bruto);
} catch {
  console.error(`API_URL inválida ou ausente (${JSON.stringify(bruto)}). Defina no .env ou no ambiente.`);
  process.exit(1);
}
if (url.protocol !== 'https:') {
  // Página em https chamando API em http é bloqueada pelo navegador (mixed content).
  console.error(`API_URL precisa ser https: ${url.href}`);
  process.exit(1);
}

const base = url.href.replace(/\/+$/, '');
console.log(`API_URL = ${base}`);

const { Architect } = require('@angular-devkit/architect');
const { WorkspaceNodeModulesArchitectHost } = require('@angular-devkit/architect/node');
const { logging, schema, workspaces } = require('@angular-devkit/core');
const { NodeJsSyncHost } = require('@angular-devkit/core/node');

const registro = new schema.CoreSchemaRegistry();
registro.addPostTransform(schema.transforms.addUndefinedDefaults);

const { workspace } = await workspaces.readWorkspace(
  raiz,
  workspaces.createWorkspaceHost(new NodeJsSyncHost()),
);
const architect = new Architect(new WorkspaceNodeModulesArchitectHost(workspace, raiz), registro);

const logger = new logging.Logger('build');
logger.subscribe(({ level, message }) =>
  (level === 'error' || level === 'fatal' ? console.error : console.log)(message),
);

const execucao = await architect.scheduleTarget(
  { project: 'routine-pusher-frontend', target: 'build' },
  { define: { API_URL: JSON.stringify(base) } },
  { logger },
);
const { success } = await execucao.result;
await execucao.stop();
process.exit(success ? 0 : 1);
