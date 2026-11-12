const btnIniciar = document.getElementById("btn-iniciar");
const btnParar = document.getElementById("btn-parar");
const btnVigencia = document.getElementById("btn-vigencia");
const btnBaixarOtimizacao = document.getElementById("btn-baixar-otimizacao");

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

        .acoes-servicos-ho {
            margin: 15px 0;
            padding: 15px;
            border: 1px solid #777;
            border-radius: 8px;
        }

        .opcoes-servicos-ho {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin: 12px 0;
        }

        .opcoes-servicos-ho label {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .campo-novo-codigo-ho {
            padding: 9px;
            min-width: 230px;
            border-radius: 5px;
        }

        .botao-acao-ho {
            padding: 9px 16px;
            cursor: pointer;
        }

        .botao-acao-ho:disabled {
            cursor: wait;
            opacity: .6;
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
// DOWNLOAD DA PLANILHA FINAL
// ========================================

if (btnBaixarOtimizacao) {
    btnBaixarOtimizacao.disabled = true;

    btnBaixarOtimizacao.addEventListener("click", async () => {
        if (btnBaixarOtimizacao.disabled) return;

        btnBaixarOtimizacao.disabled = true;

        try {
            statusComparacao.textContent =
                "Preparando a planilha final...";

            const resposta = await fetch(
                "http://127.0.0.1:5000/api/baixar-otimizacao"
            );

            if (!resposta.ok) {
                let mensagem = "Não foi possível baixar a planilha final.";

                try {
                    const erro = await resposta.json();
                    mensagem = erro.erro || mensagem;
                } catch {
                    // Mantém a mensagem padrão.
                }

                throw new Error(mensagem);
            }

            const arquivo = await resposta.blob();

            const url = URL.createObjectURL(arquivo);
            const link = document.createElement("a");

            link.href = url;
            link.download = "Otimizacao_atualizada.xlsx";

            document.body.appendChild(link);
            link.click();
            link.remove();

            setTimeout(() => URL.revokeObjectURL(url), 1000);

            statusComparacao.textContent =
                "Download da planilha final concluído.";

        } catch (erro) {
            console.error("Erro no download:", erro);

            statusComparacao.textContent =
                "Erro no download: " + erro.message;

            alert(erro.message);

        } finally {
            btnBaixarOtimizacao.disabled = false;
        }
    });
}


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
// CONTROLES DE EDIÇÃO E EXCLUSÃO
// ========================================

function montarControlesEdicao(lista) {
    const servicos = [...new Set(
        (lista || []).map(item => String(item.servico))
    )];

    if (!servicos.length) return "";

    return `
        <div class="acoes-servicos-ho">
            <h4>Corrigir código do serviço na Otimização</h4>
            <p>Selecione um serviço por vez:</p>

            <div class="opcoes-servicos-ho">
                ${servicos.map(servico => `
                    <label>
                        <input type="radio" name="servico-edicao-ho"
                            value="${escaparHTML(servico)}">
                        ${escaparHTML(servico)}
                    </label>
                `).join("")}
            </div>

            <div style="display:flex;flex-wrap:wrap;gap:10px;">
                <input type="text" id="novo-codigo-ho"
                    class="campo-novo-codigo-ho"
                    placeholder="Digite o novo código do serviço">

                <button type="button" id="btn-editar-ho"
                    class="botao-acao-ho">
                    Editar serviço
                </button>
            </div>
        </div>
    `;
}


function montarControlesExclusao(lista) {
    const servicos = [...new Set(
        (lista || []).map(item => String(item.servico))
    )];

    if (!servicos.length) return "";

    return `
        <div class="acoes-servicos-ho">
            <h4>Excluir serviços da Otimização</h4>
            <p>Selecione um ou mais serviços:</p>

            <div class="opcoes-servicos-ho">
                ${servicos.map(servico => `
                    <label>
                        <input type="checkbox" name="servico-excluir-ho"
                            value="${escaparHTML(servico)}">
                        ${escaparHTML(servico)}
                    </label>
                `).join("")}
            </div>

            <button type="button" id="btn-excluir-ho"
                class="botao-acao-ho">
                Excluir selecionados
            </button>
        </div>
    `;
}


// ========================================
// ATUALIZAR COMPARAÇÃO APÓS A OPERAÇÃO
// ========================================

async function atualizarComparacao(aba) {
    const resposta = await fetch(
        "http://127.0.0.1:5000/api/recomparar"
    );

    const dados = await resposta.json();

    if (!resposta.ok) {
        throw new Error(
            dados.erro || `Erro HTTP ${resposta.status}`
        );
    }

    mostrarResultados(dados);

    if (aba) {
        ativarAba(aba);
    }
}


// ========================================
// CORRIGIR QUALQUER CÓDIGO DE SERVIÇO NA OTIMIZAÇÃO
// ========================================

async function editarServicoHO() {
    const selecionado = areaResultados.querySelector(
        'input[name="servico-edicao-ho"]:checked'
    );

    const campoNovoCodigo = document.getElementById("novo-codigo-ho");

    if (!selecionado) {
        alert("Selecione um serviço para editar.");
        return;
    }

    const novoCodigo = campoNovoCodigo.value
        .trim()
        .replace(/\s*\/\s*/g, "/");

    if (!/^\d+(?:\/\d+)?$/.test(novoCodigo)) {
        alert("Informe um código válido. Use apenas números e, se necessário, uma barra para separar os códigos.");
        return;
    }

    const botao = document.getElementById("btn-editar-ho");
    botao.disabled = true;

    try {
        statusComparacao.textContent =
            "Editando serviço na Otimização...";

        const resposta = await fetch(
            "http://127.0.0.1:5000/api/editar-otimizacao",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    servico: selecionado.value,
                    novo_codigo: novoCodigo
                })
            }
        );

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.erro || "Erro ao editar serviço."
            );
        }

        await atualizarComparacao("ausentes-demanda");

        statusComparacao.textContent =
            `${resultado.mensagem} ${resultado.linhas_alteradas} linha(s) alterada(s).`;

    } catch (erro) {
        console.error("Erro ao editar serviço:", erro);
        statusComparacao.textContent = "Erro: " + erro.message;
        alert(erro.message);

    } finally {
        const botaoAtual = document.getElementById("btn-editar-ho");
        if (botaoAtual) botaoAtual.disabled = false;
    }
}


// ========================================
// EXCLUIR SERVIÇOS DA OTIMIZAÇÃO
// ========================================

async function excluirServicosHO() {
    const selecionados = [
        ...areaResultados.querySelectorAll(
            'input[name="servico-excluir-ho"]:checked'
        )
    ].map(campo => campo.value);

    if (!selecionados.length) {
        alert("Selecione pelo menos um serviço para excluir.");
        return;
    }

    const confirmar = window.confirm(
        `Deseja excluir ${selecionados.length} serviço(s) da Otimização?`
    );

    if (!confirmar) return;

    const botao = document.getElementById("btn-excluir-ho");
    botao.disabled = true;

    try {
        statusComparacao.textContent =
            "Excluindo serviços da Otimização...";

        const resposta = await fetch(
            "http://127.0.0.1:5000/api/excluir-otimizacao",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    servicos: selecionados
                })
            }
        );

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(
                resultado.erro || "Erro ao excluir serviços."
            );
        }

        await atualizarComparacao("ausentes-demanda");

        statusComparacao.textContent =
            `${resultado.mensagem} ${resultado.linhas_excluidas} linha(s) excluída(s).`;

    } catch (erro) {
        console.error("Erro ao excluir serviços:", erro);
        statusComparacao.textContent = "Erro: " + erro.message;
        alert(erro.message);

    } finally {
        const botaoAtual = document.getElementById("btn-excluir-ho");
        if (botaoAtual) botaoAtual.disabled = false;
    }
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
        throw new Error(
            "O servidor não retornou o resumo da comparação."
        );
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
            <h3 class="titulo-secao">
                Serviços HO ausentes na Otimização
            </h3>

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
            <h3 class="titulo-secao">
                Serviços HO ausentes na Alta Demanda
            </h3>

            ${montarControlesEdicao(dados.ausentes_demanda)}

            ${montarControlesExclusao(dados.ausentes_demanda)}

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

    // Habilita o único botão de download após a comparação.
    if (btnBaixarOtimizacao) {
        btnBaixarOtimizacao.disabled = false;
    }

    areaResultados.querySelectorAll(".aba-resultado").forEach(botao => {
        botao.addEventListener("click", () => {
            ativarAba(botao.dataset.aba);
        });
    });

    const botaoEditar = document.getElementById("btn-editar-ho");

    if (botaoEditar) {
        botaoEditar.addEventListener("click", editarServicoHO);
    }

    const botaoExcluir = document.getElementById("btn-excluir-ho");

    if (botaoExcluir) {
        botaoExcluir.addEventListener("click", excluirServicosHO);
    }

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

    // Uma nova comparação substitui a cópia de trabalho anterior.
    if (btnBaixarOtimizacao) {
        btnBaixarOtimizacao.disabled = true;
    }

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

if (btnBaixarOtimizacao) {
    btnBaixarOtimizacao.disabled = true;
}

console.log("NIETZSCHE - COMPARAÇÃO, EDIÇÃO, EXCLUSÃO E DOWNLOAD DA PLANILHA FINAL CARREGADOS");


// ========================================
// REFINAMENTO VISUAL DOS RESULTADOS HO
// ========================================

(function melhorarVisualNietzsche() {
    const estilo = document.createElement("style");
    estilo.id = "refinamento-visual-nietzsche";

    estilo.textContent = `
        .acoes-servicos-ho {
            background: #f8fafc;
            border: 1px solid #dce3eb;
            border-left: 4px solid #2879c7;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            box-shadow: 0 2px 8px rgba(0,0,0,.04);
        }

        .acoes-servicos-ho h4 {
            color: #26384a;
            font-size: 16px;
            font-weight: 700;
            margin: 0 0 7px;
        }

        .acoes-servicos-ho p {
            color: #64748b;
            font-size: 13px;
            margin: 0 0 16px;
        }

        .opcoes-servicos-ho {
            display: flex;
            flex-wrap: wrap;
            gap: 9px;
            margin: 15px 0 18px;
        }

        .opcoes-servicos-ho label {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 14px;
            background: white;
            border: 1px solid #d8e0e9;
            border-radius: 7px;
            color: #334155;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: .2s;
        }

        .opcoes-servicos-ho label:hover {
            border-color: #2879c7;
            background: #eff6ff;
        }

        .opcoes-servicos-ho input {
            accent-color: #2879c7;
            cursor: pointer;
        }

        .opcoes-servicos-ho label:has(input:checked) {
            background: #eaf3ff;
            border-color: #2879c7;
            color: #185a9d;
        }

        .campo-novo-codigo-ho {
            padding: 11px 13px;
            min-width: 250px;
            border: 1px solid #cbd5e1;
            border-radius: 7px;
            font-size: 14px;
            outline: none;
            transition: .2s;
        }

        .campo-novo-codigo-ho:focus {
            border-color: #2879c7;
            box-shadow: 0 0 0 3px rgba(40,121,199,.12);
        }

        .botao-acao-ho {
            padding: 11px 19px;
            border: none;
            border-radius: 7px;
            background: #2879c7;
            color: white;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: .2s;
        }

        #btn-editar-ho:hover {
            background: #185a9d;
            transform: translateY(-1px);
        }

        #btn-excluir-ho {
            background: #c83b3b;
        }

        #btn-excluir-ho:hover {
            background: #a92727;
            transform: translateY(-1px);
        }

        .botao-acao-ho:disabled {
            opacity: .55;
            cursor: wait;
            transform: none;
        }

        .tabela-resultados-container {
            background: white;
            border: 1px solid #e2e8f0;
            border-radius: 9px;
            overflow-x: auto;
            margin-top: 15px;
        }

        .tabela-resultados {
            border-collapse: collapse;
            width: 100%;
            font-size: 13px;
        }

        .tabela-resultados th {
            background: #26384a;
            color: white;
            padding: 13px 12px;
            font-weight: 600;
        }

        .tabela-resultados td {
            padding: 11px 12px;
            border-bottom: 1px solid #e8edf2;
        }

        .tabela-resultados tbody tr:last-child td {
            border-bottom: none;
        }

        .tabela-resultados tbody tr:hover {
            filter: brightness(.97);
        }

        .abas-resultados {
            border-bottom: 1px solid #dce3eb;
            padding-bottom: 10px;
            gap: 8px;
        }

        .aba-resultado {
            border: 1px solid #dce3eb;
            border-radius: 7px;
            background: #f1f5f9;
            color: #475569;
            font-weight: 600;
            transition: .2s;
        }

        .aba-resultado:hover {
            background: #e2eaf3;
        }

        .aba-resultado.ativa {
            background: #26384a;
            border-color: #26384a;
            color: white;
        }

        @media(max-width: 600px) {
            .acoes-servicos-ho {
                padding: 15px;
            }

            .campo-novo-codigo-ho {
                width: 100%;
                min-width: 0;
            }

            .botao-acao-ho {
                width: 100%;
            }
        }
    `;

    const estiloAnterior = document.getElementById(
        "refinamento-visual-nietzsche"
    );

    if (estiloAnterior) estiloAnterior.remove();

    document.head.appendChild(estilo);
})();

(function removerQuadroExagerado() {
    const estilo = document.createElement("style");
    estilo.textContent = `
        .acoes-servicos-ho {
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            padding: 8px 0 !important;
            margin: 8px 0 !important;
        }
    `;

    document.head.appendChild(estilo);
})();