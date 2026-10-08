import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateLinks } from '../catalog.mjs';

const link = {id:'address-test',name:'Portal',description:'',category:'Equipe',logo:'/donato-eye.svg'};
test('cadastro completa os prefixos e preserva destinos explícitos, subdomínios e rede interna',() => {
  for(const [input, expected] of [
    [' example.com/equipe?q=1#inicio ','https://www.example.com/equipe?q=1#inicio'],
    ['empresa.com.br/portal','https://www.empresa.com.br/portal'],
    ['www.example.com','https://www.example.com'],
    ['portal.empresa.com.br/login','https://portal.empresa.com.br/login'],
    ['sistemas.example.com','https://sistemas.example.com'],
    ['https://example.com/portal','https://example.com/portal'],
    ['http://servidor:8080/portal','http://servidor:8080/portal'],
    ['192.168.1.10:8080/portal','https://192.168.1.10:8080/portal'],
    ['localhost:3030/admin/','https://localhost:3030/admin/'],
    ['servidor.local/portal','https://servidor.local/portal'],
    ['example.com:8443/portal','https://www.example.com:8443/portal'],
  ])assert.equal(validateLinks([{...link,url:input}])[0].url,expected,input);
});
test('completar o endereço não permite URLs executáveis ou com credenciais',() => {
  for(const url of ['','javascript:alert(1)','data:text/html,<script>','file:///relative/secret','ftp://example.com','user:pass@example.com','endereço inválido']) {
    assert.throws(() => validateLinks([{...link,url}]),{status:400},url);
  }
});
test('arquivos e pastas em unidades mapeadas e UNC preservam espaços, acentos e nomes literais',() => {
  for(const [url,expected] of [
    [String.raw`O:\GERAL\ÁREA DE TRANSFERENCIA\Lista Nova.xlsx`,'file:///O:/GERAL/%C3%81REA%20DE%20TRANSFERENCIA/Lista%20Nova.xlsx'],
    [String.raw`\\servidor\GERAL\Área da equipe\Lista #1.xlsx`,'file://servidor/GERAL/%C3%81rea%20da%20equipe/Lista%20%231.xlsx'],
    [String.raw`\\servidor\GERAL\Pasta da equipe`,'file://servidor/GERAL/Pasta%20da%20equipe'],
    ['file:///O:/GERAL/%C3%81REA%20DE%20TRANSFERENCIA/Lista%20Nova.xlsx','file:///O:/GERAL/%C3%81REA%20DE%20TRANSFERENCIA/Lista%20Nova.xlsx'],
  ])assert.equal(validateLinks([{...link,url}])[0].url,expected);
  for(const url of ['file://servidor/','file:///pasta/arquivo','file:///O:/arquivo%00.xlsx','file:///O:/arquivo.xlsx?command=x','file://./share/arquivo'])assert.throws(() => validateLinks([{...link,url}]),{status:400});
});
