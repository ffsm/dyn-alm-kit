# Componentes suportados

| Componente | Status | Onde o dev edita | Como entra no pacote |
|---|---|---|---|
| Webresource (js, html, css, imagens, svg, resx…) | ✅ implementado | `src/webresources/<prefixo>_/…` | `assembleSolution` copia para `WebResources/` no staging |
| PCF (code component) | 📋 planejado | `src/pcf/<Controle>/` | — |
| Plugin (assembly) | 📋 planejado | `src/plugins/<Projeto>/` | — |
| Custom API | 📋 planejado | `solution/customapis/` + plugin | — |
| Tabelas, formulários, views, sitemap, apps | ⚠ só via sync | no portal (maker) → `npm run sync` | metadados em `solution/` |

Ao receber pedido de componente 📋: explique o plano abaixo, diga que ainda não está automatizado e ofereça registrar no roadmap. **Não improvise** a estrutura da solution para esses tipos sem validar com `pac solution pack` + import num ambiente de teste.

## Webresource ✅
- Criar: `npm run new-webresource -- <prefixo>_/pasta/arquivo.ext [--display "Nome"]` → arquivo em `src/`, `.data.xml` com GUID novo e `RootComponent type="61"`.
- Tipos por extensão: htm/html=1, css=2, js=3, xml=4, png=5, jpg=6, gif=7, xap=8, xsl/xslt=9, ico=10, svg=11, resx=12.
- Validado: conteúdo exportado do ambiente volta byte a byte idêntico; drift só aparece com mudança real.

## PCF 📋 (plano)
- Fonte: projeto `pac pcf init` em `src/pcf/<Controle>/` (TypeScript, `npm run build` do controle).
- Build: o caminho suportado pela Microsoft é o **projeto de solution `.cdsproj`** com `pac solution add-reference --path src/pcf/<Controle>` e `dotnet build` (gera unmanaged/managed com `SolutionPackageType=Both`). O build da esteira passaria a chamar `dotnet build` em vez de só `pac solution pack`.
- Teste rápido no Dev: `pac pcf push --publisher-prefix <prefixo>` (cria solution temporária — não usar para release).
- Drift: o export traz o bundle compilado (`Controls/…/bundle.js`); não dá para mesclar de volta no TypeScript → drift de PCF deve ser só **detectado**, não sincronizado.
- Riscos: versão do controle (`ControlManifest.Input.xml`) precisa subir a cada mudança, senão o Dataverse não atualiza o bundle.

## Plugin 📋 (plano)
- Fonte: `pac plugin init` em `src/plugins/<Projeto>/` (.NET Framework 4.6.2, assembly **assinado**).
- Build: `dotnet build -c Release`; o .dll entra na solution em `PluginAssemblies/<Nome>-<GUID>/` (metadados `.data.xml` em `solution/`).
- Registro de steps (mensagem, entidade, estágio, filtros, imagens) fica em `SdkMessageProcessingSteps/` dentro da solution — **é metadado de solution**, versionado em `solution/` e alterado pela Plugin Registration Tool → sync.
- Managed do fonte: validar com unpack **Both** (export unmanaged + managed) antes de confiar no managed gerado localmente.
- Riscos: alterar assembly sem mudar a versão do assembly não atualiza no ambiente; strong name key fica no repo (sem senha) ou no cofre da esteira.

## Custom API 📋 (plano)
- Componentes `customapi`, `customapirequestparameter`, `customapiresponseproperty` em `solution/customapis/…` + plugin que implementa (ver Plugin).
- Criação mais segura: pelo maker/Plugin Registration Tool no Dev → `npm run sync` traz os XMLs → a partir daí é versionado.

## Tabelas, formulários, views (sync)
Feitos no portal do Dev e trazidos com `npm run sync -- dev --merge`. O build managed local para esses tipos precisa de validação: forms/sitemap têm variantes `*_managed.xml` no unpack Both. Ao adotar uma solution existente com esses componentes, o `init-solution` avisa.
