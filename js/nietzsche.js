
const btnIniciar = document.getElementById("btn-iniciar");
const btnParar = document.getElementById("btn-parar");
const btnVigencia = document.getElementById("btn-vigencia");

const arquivoProgramacao = document.getElementById("arquivo-programacao");
const arquivoOtimizacao = document.getElementById("arquivo-otimizacao");

const dataInicio = document.getElementById("data-inicio");
const dataFim = document.getElementById("data-fim");
const semanas = document.getElementById("semanas");

const statusVigencia = document.getElementById("status-vigencia");
const statusComparacao = document.getElementById("status-comparacao");
const areaResultados = document.getElementById("resultados-comparacao");

let requisicaoAtual = null;
let vigenciaConfirmada = false;
let dadosVigencia = null;


// ========================================
// ESTILOS
// ========================================

function adicionarEstilos() {
    if (document.getElementById("estilos-nietzsche")) return;

    const estilo = document.createElement("style");
    estilo.id = "estilos-nietzsche";

    estilo.textContent = `
        .resumo-comparacao {
            display: grid;
            grid-template-columns: repeat(auto-fit,minmax(145px,1fr));
            gap: 12px;
            margin: 20px 0;
        }

        .resultado-card {
            background: #f4f5f7;
            border: 1px solid #ddd;
            border-radius: 10px;
            padding: 16px;
            text-align: center;
        }

        .resultado-card h3 {
            font-size: 27px;
            margin: 0 0 8px;
        }

        .resultado-card p {
            margin: 0;
            font-size: 13px;
        }

        .card-ho { border: 2px solid #2879c7; }
        .card-verde { border: 2px solid #239b56; }
        .card-vermelho { border: 2px solid #d93025; }

        .tabela-resultados-container {
            width: 100%;
            overflow-x: auto;
            margin-top: 15px;
        }

        .tabela-resultados {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .tabela-resultados th,
        .tabela-resultados td {
            padding: 10px;
            border: 1px solid #ddd;
            text-align: left;
            white-space: nowrap;
        }

        .tabela-resultados th {
            background: #343a40;
            color: white;
        }

        .linha-verde { background: #e1f5e8; }
        .linha-vermelha { background: #fde2e2; }

        .servico-verde {
            color: #137333;
            font-weight: bold;
        }

        .servico-vermelho {
            color: #c5221f;
            font-weight: bold;
        }

        .abas-resultados {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin: 20px 0;
        }

        .aba-resultado {
            padding: 10px 15px;
            cursor: pointer;
            border: 1px solid #ccc;
            border-radius: 6px;
            background: #eee;
        }

        .aba-resultado.ativa {
            background: #343a40;
            color: white;
        }

        .conteudo-aba { display: none; }
        .conteudo-aba.ativa { display: block; }

        .resultado-vazio {
            padding: 15px;
            background: #f4f4f4;
            border-radius: 6px;
        }

        .titulo-secao {
            margin-top: 25px;
            font-size: 19px;
        }

        @media(max-width:600px) {
            .resumo-comparacao {
                grid-template-columns: repeat(2,1fr);
            }
        }
    `;

    document.head.appendChild(estilo);
}


// ========================================
// SEGURANÇA E FORMATAÇÃO
// ========================================

function escaparHTML(valor) {
    return String(valor ?? "—")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function numero(valor) {
    return Number(valor || 0).toLocaleString("pt-BR");
}


// ========================================
// VIGÊNCIA
// ========================================

btnVigencia?.addEventListener("click", () => {
    const inicio = dataInicio.value;
    const fim = dataFim.value;
    const quantidadeSemanas = Number(semanas.value);

    if (!inicio || !fim) {
        statusVigencia.textContent = "Selecione as duas datas.";
        vigenciaConfirmada = false;
        return;
    }

    if (fim < inicio) {
        statusVigencia.textContent =
            "A data final não pode ser anterior à inicial.";
        vigenciaConfirmada = false;
        return;
    }

    if (
        !Number.isInteger(quantidadeSemanas) ||
        quantidadeSemanas < 1 ||
        quantidadeSemanas > 4
    ) {
        statusVigencia.textContent =
            "Informe uma quantidade de 1 a 4 semanas.";
        vigenciaConfirmada = false;
        return;
    }

    dadosVigencia = {
        data_inicio: inicio,
        data_fim: fim,
        semanas: quantidadeSemanas
    };

    vigenciaConfirmada = true;

    statusVigencia.textContent =
        `Vigência confirmada: ${inicio} até ${fim} (${quantidadeSemanas} semanas).`;
});

[dataInicio, dataFim, semanas].forEach(campo => {
    campo?.addEventListener("input", () => {
        vigenciaConfirmada = false;
        dadosVigencia = null;

        statusVigencia.textContent =
            "Confirme novamente a vigência.";
    });
});


// ========================================
// TABELAS
// ========================================

function criarTabela(cabecalhos, linhas, mensagem) {
    if (!Array.isArray(linhas) || linhas.length === 0) {
        return `<p class="resultado-vazio">${escaparHTML(mensagem)}</p>`;
    }

    return `
        <div class="tabela-resultados-container">
            <table class="tabela-resultados">
                <thead>
                    <tr>
                        ${cabecalhos.map(c =>
                            `<th>${escaparHTML(c)}</th>`
                        ).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${linhas.map(linha => `
                        <tr class="${escaparHTML(linha.classe || "")}">
                            ${linha.valores.map((valor, indice) => `
                                <td class="${
                                    indice === 0
                                    ? escaparHTML(linha.classeServico || "")
                                    : ""
                                }">
                                    ${escaparHTML(valor)}
                                </td>
                            `).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>

        <p>Quantidade de registros: ${numero(linhas.length)}</p>
    `;
}


// ========================================
// CONVERTER REGISTROS EM LINHAS
// ========================================

function registroParaLinha(registro, classe = "") {
    return {
        classe,
        classeServico: classe === "linha-verde"
            ? "servico-verde"
            : "servico-vermelho",

        valores: [
            registro.servico,
            registro.tipo,
            registro.origem,
            registro.destino,
            registro.frota,
            registro.linha,
            registro.coluna,
            registro.situacao
        ]
    };
}


// ========================================
// CORRESPONDENTES HO
// ========================================

// ========================================
// CORRESPONDENTES HO
// ========================================

function montarCorrespondentes(lista) {
    const linhas = [];

    function possuiLetras(valor) {
        return /[A-Za-zÀ-ÖØ-öø-ÿ]/.test(
            String(valor ?? "").trim()
        );
    }

    (lista || []).forEach(item => {
        const demanda = item.linhas_demanda || [];
        const otimizacao = item.linhas_otimizacao || [];

        const quantidade = Math.max(
            demanda.length,
            otimizacao.length
        );

        for (let i = 0; i < quantidade; i++) {
            const d = demanda[i] || {};
            const o = otimizacao[i] || {};

            // Ignora registros sem origem e destino identificados
            if (
                !possuiLetras(d.origem) ||
                !possuiLetras(d.destino) ||
                !possuiLetras(o.origem) ||
                !possuiLetras(o.destino)
            ) {
                continue;
            }

            linhas.push({
                classe: "linha-verde",
                classeServico: "servico-verde",

                valores: [
                    item.servico,
                    d.tipo || item.tipo_demanda || "HO",
                    d.origem,
                    d.destino,
                    d.frota ?? "—",
                    d.linha ?? "—",
                    o.origem,
                    o.destino,
                    o.frota ?? "—",
                    o.linha ?? "—",
                    "CORRESPONDENTE"
                ]
            });
        }
    });

    return linhas;
}


// ========================================
// AUSENTES NA OTIMIZAÇÃO
// ========================================

function montarAusentesOtimizacao(lista) {
console.log("NIETZSCHE NOVO CARREGADO!");
    return (lista || []).map(registro => ({
        classe: "linha-vermelha",
        classeServico: "servico-vermelho",

        valores: [
            registro.servico,
            registro.tipo,
            registro.origem,
            registro.destino,
            registro.frota,
            registro.linha,
            registro.coluna,
            registro.situacao
        ]
    }));
}


// ========================================
// AUSENTES NA ALTA DEMANDA
// ========================================

function montarAusentesDemanda(lista) {
    return (lista || []).map(registro => ({
        classe: "linha-vermelha",
        classeServico: "servico-vermelho",

        valores: [
            registro.servico,
            registro.tipo,
            registro.origem,
            registro.destino,
            registro.frota,
            registro.linha,
            registro.coluna,
            registro.situacao
        ]
    }));
}


// ========================================
// RESUMO
// ========================================

function montarResumo(resumo) {
    const cartoes = [
        {
            valor: resumo.total_ho_demanda,
            titulo: "HO na Alta Demanda",
            classe: "card-ho"
        },
        {
            valor: resumo.total_ho_otimizacao,
            titulo: "HO na Otimização",
            classe: "card-ho"
        },
        {
            valor: resumo.correspondentes,
            titulo: "Correspondentes HO",
            classe: "card-verde"
        },
        {
            valor: resumo.ausentes_otimizacao,
            titulo: "Ausentes na Otimização",
            classe: "card-vermelho"
        },
        {
            valor: resumo.ausentes_demanda,
            titulo: "Ausentes na Alta Demanda",
            classe: "card-vermelho"
        }
    ];

    return `
        <div class="resumo-comparacao">
            ${cartoes.map(cartao => `
                <div class="resultado-card ${cartao.classe}">
                    <h3>${numero(cartao.valor)}</h3>
                    <p>${escaparHTML(cartao.titulo)}</p>
                </div>
            `).join("")}
        </div>
    `;
}

// ========================================
// ABAS
// ========================================

function ativarAba(nome) {
    document.querySelectorAll(".aba-resultado").forEach(botao => {
        botao.classList.toggle(
            "ativa",
            botao.dataset.aba === nome
        );
    });

    document.querySelectorAll(".conteudo-aba").forEach(conteudo => {
        conteudo.classList.toggle(
            "ativa",
            conteudo.id === `aba-${nome}`
        );
    });
}


// ========================================
// EXIBIR RESULTADOS
// ========================================

function mostrarResultados(dados) {
    adicionarEstilos();

    if (!dados || !dados.resumo) {
        throw new Error("O servidor não retornou o resumo da comparação.");
    }

    const resumo = dados.resumo;

    const correspondentes = montarCorrespondentes(
        dados.correspondentes
    );

    const ausentesOtimizacao = montarAusentesOtimizacao(
        dados.ausentes_otimizacao
    );

    const ausentesDemanda = montarAusentesDemanda(
        dados.ausentes_demanda
    );

    areaResultados.innerHTML = `
        <h2>Resultado da comparação</h2>

        ${montarResumo(resumo)}

        <div class="abas-resultados" role="tablist">
            <button type="button" class="aba-resultado ativa"
                data-aba="correspondentes">
                Correspondentes HO (${numero(resumo.correspondentes)})
            </button>

            <button type="button" class="aba-resultado"
                data-aba="ausentes-otimizacao">
                Ausentes na Otimização (${numero(resumo.ausentes_otimizacao)})
            </button>

            <button type="button" class="aba-resultado"
                data-aba="ausentes-demanda">
                Ausentes na Alta Demanda (${numero(resumo.ausentes_demanda)})
            </button>

            <button type="button" class="aba-resultado"
                data-aba="previas">
                Prévia das planilhas
            </button>
        </div>

        <section id="aba-correspondentes" class="conteudo-aba ativa">
            <h3 class="titulo-secao">Serviços HO correspondentes</h3>

            ${criarTabela(
                [
                    "Serviço",
                    "Tipo",
                    "Origem - Alta Demanda",
                    "Destino - Alta Demanda",
                    "Frota - Alta Demanda",
                    "Linha - Alta Demanda",
                    "Origem - Otimização",
                    "Destino - Otimização",
                    "Frota - Otimização",
                    "Linha - Otimização",
                    "Situação"
                ],
                correspondentes,
                "Nenhum serviço correspondente."
            )}
        </section>

        <section id="aba-ausentes-otimizacao" class="conteudo-aba">
            <h3 class="titulo-secao">Serviços HO ausentes na Otimização</h3>

            ${criarTabela(
                [
                    "Serviço",
                    "Tipo",
                    "Origem",
                    "Destino",
                    "Frota",
                    "Linha na Alta Demanda",
                    "Coluna",
                    "Situação"
                ],
                ausentesOtimizacao,
                "Nenhum serviço ausente na Otimização."
            )}
        </section>

        <section id="aba-ausentes-demanda" class="conteudo-aba">
            <h3 class="titulo-secao">Serviços HO ausentes na Alta Demanda</h3>

            ${criarTabela(
                [
                    "Serviço",
                    "Tipo",
                    "Origem",
                    "Destino",
                    "Frota",
                    "Linha na Otimização",
                    "Coluna",
                    "Situação"
                ],
                ausentesDemanda,
                "Nenhum serviço ausente na Alta Demanda."
            )}
        </section>

        <section id="aba-previas" class="conteudo-aba">
            <h3 class="titulo-secao">Prévia da Alta Demanda</h3>

            ${
                Array.isArray(dados.previa_demanda)
                ? criarTabela(
                    ["Linha", "Serviço", "Origem", "Destino", "Tipo", "Frota"],
                    dados.previa_demanda.map(r => ({
                        valores: [
                            r.linha, r.servico, r.origem,
                            r.destino, r.tipo, r.frota
                        ]
                    })),
                    "Sem dados de prévia."
                )
                : `<p class="resultado-vazio">
                    A prévia ainda não foi enviada pelo Python.
                    A comparação e as tabelas acima utilizam os dados retornados pelo servidor.
                  </p>`
            }

            <h3 class="titulo-secao">Prévia da Otimização</h3>

            ${
                Array.isArray(dados.previa_otimizacao)
                ? criarTabela(
                    ["Linha", "Serviço", "Origem", "Destino", "Tipo", "Frota"],
                    dados.previa_otimizacao.map(r => ({
                        valores: [
                            r.linha, r.servico, r.origem,
                            r.destino, r.tipo, r.frota
                        ]
                    })),
                    "Sem dados de prévia."
                )
                : `<p class="resultado-vazio">
                    A prévia ainda não foi enviada pelo Python.
                  </p>`
            }
        </section>
    `;

    areaResultados.querySelectorAll(".aba-resultado").forEach(botao => {
        botao.addEventListener("click", () => {
            ativarAba(botao.dataset.aba);
        });
    });

    areaResultados.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ========================================
// INICIAR COMPARAÇÃO
// ========================================

btnIniciar?.addEventListener("click", async () => {
    if (requisicaoAtual) return;

    const programacao = arquivoProgramacao.files[0];
    const otimizacao = arquivoOtimizacao.files[0];

    if (!programacao || !otimizacao) {
        statusComparacao.textContent =
            "Selecione os dois arquivos Excel.";
        return;
    }

    if (!vigenciaConfirmada || !dadosVigencia) {
        statusComparacao.textContent =
            "Confirme a vigência antes de iniciar.";
        return;
    }

    const formulario = new FormData();

    formulario.append("programacao", programacao);
    formulario.append("otimizacao", otimizacao);

    formulario.append("data_inicio", dadosVigencia.data_inicio);
    formulario.append("data_fim", dadosVigencia.data_fim);
    formulario.append("semanas", dadosVigencia.semanas);

    requisicaoAtual = new AbortController();

    btnIniciar.disabled = true;

    if (btnParar) btnParar.disabled = false;

    statusComparacao.textContent =
        "Comparando as planilhas. Aguarde...";

    areaResultados.innerHTML = "";

    try {
        const resposta = await fetch(
            "http://127.0.0.1:5000/api/comparar",
            {
                method: "POST",
                body: formulario,
                signal: requisicaoAtual.signal
            }
        );

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                dados.erro || `Erro HTTP ${resposta.status}`
            );
        }

        mostrarResultados(dados);

        statusComparacao.textContent =
            "Comparação realizada com sucesso.";

    } catch (erro) {
        if (erro.name === "AbortError") {
            statusComparacao.textContent =
                "Comparação interrompida.";
        } else {
            console.error("Erro na comparação:", erro);

            statusComparacao.textContent =
                "Erro: " + erro.message;
        }
    } finally {
        requisicaoAtual = null;
        btnIniciar.disabled = false;

        if (btnParar) btnParar.disabled = true;
    }
});


// ========================================
// PARAR COMPARAÇÃO
// ========================================

btnParar?.addEventListener("click", () => {
    if (requisicaoAtual) {
        requisicaoAtual.abort();
    }
});


// ========================================
// INICIALIZAÇÃO
// ========================================

adicionarEstilos();

if (btnParar) {
    btnParar.disabled = true;
}

console.log("TESTE 123 - ARQUIVO NOVO");
