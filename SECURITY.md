# Política de segurança

## Versões suportadas

| Versão | Suporte |
| --- | --- |
| 1.x | Correções de segurança quando aplicáveis |

## Reportar vulnerabilidades

**Não publique detalhes exploráveis ou arquivos pessoais em issues públicas.** Use a opção **Report a vulnerability** na aba Security do GitHub, caso disponível, ou entre em contato com o mantenedor por canal privado indicado no perfil do repositório.

Inclua passos de reprodução com arquivos sintéticos, impacto, versões afetadas e mitigação proposta. Não envie imagens contendo informações sensíveis.

## Modelo de ameaça

O aplicativo não envia arquivos ao servidor. Processamento e downloads ocorrem no navegador. O servidor expõe apenas rotas estáticas explícitas e /health, com CSP restritiva. Ainda assim, extensões maliciosas, navegador comprometido e metadados proprietários não reconhecidos estão fora das garantias do projeto. O parser trata entradas não confiáveis com limites de tamanho e verificação de comprimentos.
