# Image Metadata Cleaner · LAB//ABERTO #012

Ferramenta **open source e local-first** para remover metadados de imagens JPEG, PNG e WebP diretamente no navegador. Sem upload, login, telemetria, APIs externas ou dependências npm em runtime.

## O que faz

- Interface responsiva em português com arrastar e soltar, seleção múltipla e downloads individuais.
- Detecta a presença de blocos EXIF, XMP, IPTC, comentários JPEG, texto PNG, ICC e outros chunks conhecidos, **sem mostrar os valores**.
- Recria a imagem por canvas e exporta pixels como novo arquivo, em vez de copiar os bytes originais.
- Verifica novamente o arquivo gerado e bloqueia downloads caso encontre metadados reconhecidos.
- Mostra dimensões, tamanho original/limpo e categorias de metadados detectadas.
- Permite regular a qualidade de JPEG/WebP (50–100%).
- Até 20 arquivos por lote, 15 MB por arquivo e 25 megapixels por imagem.
- Recusa arquivos animados (APNG/WebP) para evitar perda silenciosa de quadros.
- Cabeçalhos HTTP de segurança, CSP restritiva e nenhuma rota de upload.

## Executar localmente

Requer **Node.js 20+**.

    npm ci
    npm start

Acesse http://localhost:3000. Não é necessário internet para processar as imagens depois de carregar a página.

### Docker

    docker build -t image-metadata-cleaner .
    docker run --rm -p 127.0.0.1:3000:3000 image-metadata-cleaner
    # ou
    docker compose up --build

Healthcheck: GET /health retorna JSON com status ok.

## Testes e CI

    npm run check
    npm test
    npm run validate

A suíte nativa node:test cobre assinatura dos formatos, detecção de segmentos/chunks, arquivos inválidos, imagens animadas, orquestração de re-encode e HTTP. GitHub Actions valida Node.js 20 e 22 e executa docker build em PRs.

## Como a privacidade funciona

1. O navegador lê o arquivo **localmente** e identifica apenas a existência de metadados conhecidos.
2. A imagem é decodificada e redesenhada em um canvas; o novo arquivo contém pixels reexportados, não uma cópia do arquivo original.
3. O arquivo resultante é inspecionado e só fica disponível para download se não contiver metadados reconhecidos.
4. O servidor Node apenas serve HTML, CSS e JavaScript. Não existe endpoint de upload, armazenamento ou análise remota.

**Limitações importantes:** a detecção é baseada em segmentos JPEG APP1/APP2/APP13/COM, chunks PNG conhecidos e chunks WebP EXIF/XMP/ICCP; não cobre todos os formatos e metadados proprietários. A ferramenta **não garante anonimato absoluto**: rostos, placas, texto, marcas d'água e outros dados visíveis continuam na imagem. Canvas pode alterar cor, compressão, transparência (JPEG usa fundo branco) e tamanho do arquivo. Metadados de orientação podem ser aplicados pelo navegador durante a decodificação. A compatibilidade e o resultado final variam conforme o navegador. GIF, SVG, HEIC e animações não são suportados.

**Nunca** use o resultado como única proteção para material altamente sensível. Inspecione o arquivo exportado com ferramentas independentes quando necessário.

## Arquitetura

- public/index.html + styles.css + app.js: interface e canvas no navegador.
- src/metadata.js: sniffing, inspeção e pipeline testável.
- server.js: servidor estático com allowlist e CSP.
- test/: testes Node.js sem dependências.
- .github/workflows/ci.yml: validação automatizada.

Não são usados dados, códigos, integrações ou processos corporativos privados. O projeto usa exclusivamente exemplos sintéticos.

## Roadmap

Veja [ROADMAP.md](ROADMAP.md). Sugestões e contribuições: [CONTRIBUTING.md](CONTRIBUTING.md). Relatos de segurança: [SECURITY.md](SECURITY.md).

## Licença

[MIT](LICENSE).
