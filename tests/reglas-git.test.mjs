import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
import { evaluarComando, esConventional, contieneAtribucion, enmascarar } from '../plugins/orquestador/scripts/git-hooks/reglas-git.mjs';

const ctx = (rama = 'feat/a', { archivos = {}, ramas = ['main', 'feat/a'] } = {}) => ({
  cwd: '/repo',
  ramaActual: (dir) => (dir.endsWith('otro repo') ? 'main' : rama),
  esRama: (_d, n) => ramas.includes(n),
  leerArchivo: (r) => { const t = archivos[basename(r)]; if (t === undefined) throw new Error('no'); return t; },
});
const regla = (cmd, c = ctx()) => evaluarComando(cmd, c)?.regla ?? null;

const HEREDOC_OK = `git commit -m "$(cat <<'EOF'\nfix: no se cae cuando falta config\n\nQue no explote si 'x' no existe.\nEOF\n)"`;
const HEREDOC_IA = `git commit -m "$(cat <<'EOF'\nfeat: algo\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nEOF\n)"`;
const PS_OK = "git commit -m @'\nfix: arregla el parser\n\ndetalle\n'@";
const PS_MAL = "git commit -m @'\narreglos varios\n'@";

test('esConventional y exentos', () => {
  assert.ok(esConventional('feat(cli): agrega flag'));
  assert.ok(esConventional('fix!: rompe api'));
  assert.ok(esConventional("Merge branch 'x'"));
  assert.ok(!esConventional('agrega cosas'));
  assert.ok(!esConventional('feat:sin espacio'));
});

test('contieneAtribucion', () => {
  assert.ok(contieneAtribucion('Co-Authored-By: Claude <noreply@anthropic.com>'));
  assert.ok(contieneAtribucion('🤖 Generated with [Claude Code](https://claude.com/claude-code)'));
  assert.ok(!contieneAtribucion('Co-Authored-By: Ana <ana@x.cl>'));
});

test('enmascarar conserva el largo y oculta comillas y heredocs', () => {
  const t = `echo "git push origin main" && ${HEREDOC_OK}`;
  const m = enmascarar(t);
  assert.equal(m.length, t.length);
  assert.ok(!m.includes('push origin'));
  assert.ok(!m.includes('no se cae'));
  assert.ok(m.includes('git commit'));
});

const casos = [
  ['commit en main', 'git commit -m "feat: x"', ctx('main'), 'commit-en-protegida'],
  ['commit en rama ok', 'git commit -m "feat: x"', ctx(), null],
  ['no conventional', 'git commit -m "agrega cosas"', ctx(), 'conventional'],
  ['heredoc con coautoría', HEREDOC_IA, ctx(), 'atribucion'],
  ['heredoc conventional con apóstrofo', HEREDOC_OK, ctx(), null],
  ['here-string PowerShell ok', PS_OK, ctx(), null],
  ['here-string PowerShell no conventional', PS_MAL, ctx(), 'conventional'],
  ['--no-verify en commit', 'git commit --no-verify -m "fix: a"', ctx(), 'no-verify'],
  ['-n combinado en commit', 'git commit -nm "fix: a"', ctx(), 'no-verify'],
  ['flags dentro del mensaje no cuentan', 'git commit -m "docs: explicar --no-verify y git push origin main"', ctx(), null],
  ['crear rama y commitear desde main (&&)', 'git checkout -b feat/x && git commit -m "feat: x"', ctx('main'), null],
  ['switch -c y commit (;) desde main', 'git switch -c feat/x; git commit -m "feat: x"', ctx('main'), null],
  ['checkout de archivo no cambia rama', 'git checkout README.md && git commit -m "fix: x"', ctx('main'), 'commit-en-protegida'],
  ['checkout a rama existente', 'git checkout feat/a && git commit -m "fix: x"', ctx('main'), null],
  ['-C a otro repo en main', 'git -C "otro repo" commit -m "feat: x"', ctx(), 'commit-en-protegida'],
  ['-F con coautoría', 'git commit -F msg.txt', ctx('feat/a', { archivos: { 'msg.txt': 'chore: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>\n' } }), 'atribucion'],
  ['-F conventional', 'git commit -F msg.txt', ctx('feat/a', { archivos: { 'msg.txt': 'chore: x\n' } }), null],
  ['amend sin mensaje', 'git commit --amend --no-edit', ctx(), null],
  ['merge commit', `git commit -m "Merge branch 'x'"`, ctx(), null],
  ['push de la rama', 'git push -u origin feat/a', ctx(), null],
  ['push HEAD:main', 'git push origin HEAD:main', ctx(), 'push-a-protegida'],
  ['push estando en main', 'git push', ctx('main'), 'push-a-protegida'],
  ['force a main', 'git push --force origin main', ctx(), 'force-push'],
  ['force a rama propia', 'git push -f', ctx(), null],
  ['borrar main remoto', 'git push origin --delete main', ctx(), 'push-a-protegida'],
  ['borrar con :main', 'git push origin :main', ctx(), 'push-a-protegida'],
  ['--no-verify en push', 'git push --no-verify', ctx(), 'no-verify'],
  ['push --all', 'git push --all', ctx(), 'push-a-protegida'],
  ['push --tags estando en main', 'git push --tags', ctx('main'), null],
  ['merge sin squash', 'gh pr merge 3', ctx(), 'merge-sin-squash'],
  ['merge con squash', 'gh pr merge 3 --squash --delete-branch', ctx(), null],
  ['merge --admin', 'gh pr merge 3 --squash --admin', ctx(), 'merge-admin'],
  ['pr con atribución', 'gh pr create --title "feat: algo" --body "🤖 Generated with [Claude Code](https://claude.com/claude-code)"', ctx(), 'atribucion'],
  ['pr con título no conventional', 'gh pr create --title "Agrega cosas" --body "x"', ctx(), 'conventional'],
  ['pr con body-file limpio', 'gh pr create --title "feat: x" --body-file cuerpo.md', ctx('feat/a', { archivos: { 'cuerpo.md': 'Resumen\n' } }), null],
  // I4: opciones globales de git antes del subcomando
  ['-c antes de commit en main', 'git -c commit.gpgsign=false commit -m "Agregar algo"', ctx('main'), 'commit-en-protegida'],
  ['-c core.hooksPath desactiva hooks', 'git -c core.hooksPath=/dev/null commit -m "feat: x"', ctx(), 'no-verify'],
  ['--no-pager antes de commit', 'git --no-pager commit -m "Agregar"', ctx(), 'conventional'],
  // I5: argumentos entre comillas conservan su valor
  ['refspec entre comillas a main', 'git push origin "HEAD:main"', ctx(), 'push-a-protegida'],
  ['refspec con comilla simple a main', "git push origin 'feat/x:main'", ctx(), 'push-a-protegida'],
  ['force con refspec entre comillas', 'git push --force origin "+HEAD:main"', ctx(), 'force-push'],
  ['switch a "main" y commit', 'git switch "main" && git commit -m "feat: x"', ctx(), 'commit-en-protegida'],
  ['-m con texto que parece flag no es no-verify', 'git commit -m "-n"', ctx(), 'conventional'],
  ['comando sin git', 'ls -la', ctx('main'), null],
  ['git dentro de un echo', 'echo "git push origin main"', ctx('main'), null],
];

for (const [nombre, cmd, c, esperado] of casos) {
  test(`evaluarComando: ${nombre}`, () => assert.equal(regla(cmd, c), esperado));
}
