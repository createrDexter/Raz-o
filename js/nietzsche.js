
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

let requisicaoAtual = null;
let vigenciaConfirmada = false;
let dadosVigencia = null;

// Cria a área de resultados automaticamente
let areaResultados = document.getElementById("resultados-comparacao");

if (!areaResultados) {
    areaResultados = document.createElement("section");
    areaResultados.id = "resultados-comparacao";
    statusComparacao.insertAdjacentElement("afterend", areaResultados);
}

// Evita interpretar conteúdo recebido como HTML
function escaparHTML(valor) {
    return String(valor ?? "—")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Confirma a vigência
btnVigencia.addEventListener("click", () => {
    const inicio = dataInicio.value;
    const fim = dataFim.value;
    const quantidadeSemanas = Number(semanas.value);

    if (!inicio || !fim) {
        statusVigencia.textContent = "Selecione as duas datas.";
        vigenciaConfirmada = false;
        dadosVigencia = null;
        return;
    }

    if (fim < inicio) {
        statusVigencia.textContent =
            "A data final não pode ser anterior à inicial.";
        vigenciaConfirmada = false;
        dadosVigencia = null;
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
        dadosVigencia = null;
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

// Exige nova confirmação se algum campo for alterado
[dataInicio, dataFim, semanas].forEach((campo) => {
    campo.addEventListener("input", () => {
        vigenciaConfirmada = false;
        dadosVigencia = null;
        statusVigencia.textContent = "Confirme novamente a vigência.";
    });
});

// Cria tabela reutilizável
function criarTabela(cabecalhos, linhas, mensagem) {
    if (!linhas || linhas.length === 0) {
        return `<p class="resultado-vazio">${escaparHTML(mensagem)}</p>`;
    }

    return `
        <div class="tabela-resultados-container">
            <table class="tabela-resultados">
                <thead>
                    <tr>
                        ${cabecalhos.map(titulo => `
                            <th>${escaparHTML(titulo)}</th>
                        `).join("")}
                    </tr>
                </thead>

                <tbody>
                    ${linhas.map(linha => `
                        <tr>
                            ${linha.map(valor => `
                                <td>${escaparHTML(valor)}</td>
                            `).join("")}
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

// Mostra os resultados recebidos do Python
function mostrarResultados(resultado) {
    const resumo = resultado.resumo || {};

    areaResultados.innerHTML = `
        <section class="painel-resultados">

            <h2>Resultado da comparação</h2>

            <div class="resumo-comparacao">

                <div class="resultado-card">
                    <h3>${escaparHTML(resumo.total_demanda ?? 0)}</h3>
                    <p>Serviços na Alta Demanda</p>
                </div>

                <div class="resultado-card">
                    <h3>${escaparHTML(resumo.total_otimizacao ?? 0)}</h3>
                    <p>Serviços na Otimização</p>
                </div>

                <div class="resultado-card">
                    <h3>${escaparHTML(resumo.correspondentes ?? 0)}</h3>
                    <p>Correspondentes</p>
                </div>

                <div class="resultado-card">
                    <h3>${escaparHTML(resumo.ausentes_otimizacao ?? 0)}</h3>
                    <p>Ausentes na Otimização</p>
                </div>

                <div class="resultado-card">
                    <h3>${escaparHTML(resumo.ausentes_demanda ?? 0)}</h3>
                    <p>Ausentes na Alta Demanda</p>
                </div>

            </div>

            <nav class="abas-resultados" role="tablist">

                <button class="aba-resultado ativa"
                    data-aba="correspondentes"
                    role="tab"
                    aria-selected="true">
                    Correspondentes
                </button>

                <button class="aba-resultado"
                    data-aba="ausentes-otimizacao"
                    role="tab"
                    aria-selected="false">
                    Ausentes na Otimização
                </button>

                <button class="aba-resultado"
                    data-aba="ausentes-demanda"
                    role="tab"
                    aria-selected="false">
                    Ausentes na Alta Demanda
                </button>

                <button class="aba-resultado"
                    data-aba="previa"
                    role="tab"
                    aria-selected="false">
                    Prévia das planilhas
                </button>

            </nav>

            <div id="conteudo-abas-resultados" role="tabpanel"></div>

        </section>
    `;

    const botoes = areaResultados.querySelectorAll(".aba-resultado");

    const conteudo = areaResultados.querySelector(
        "#conteudo-abas-resultados"
    );

    // Controla a troca entre as abas
    function abrirAba(nome) {

        botoes.forEach(botao => {
            const ativa = botao.dataset.aba === nome;

            botao.classList.toggle("ativa", ativa);
            botao.setAttribute("aria-selected", String(ativa));
        });

        // ABA 1: CORRESPONDENTES
        if (nome === "correspondentes") {

            const registros = (resultado.correspondentes || [])
                .flatMap(item => item.registros || []);

            const linhas = registros.map(item => [
                item.linha,
                item.servico,
                item.tipo,
                item.origem,
                item.destino
            ]);

            conteudo.innerHTML = `
                <h3>Serviços correspondentes</h3>

                <p class="quantidade-resultados">
                    ${linhas.length} registros encontrados
                </p>

                ${criarTabela(
                    ["Linha", "Serviço", "Tipo", "Origem", "Destino"],
                    linhas,
                    "Nenhum serviço correspondente encontrado. Confira os registros enviados pelo Python."
                )}
            `;
        }

        // ABA 2: AUSENTES NA OTIMIZAÇÃO
        else if (nome === "ausentes-otimizacao") {

            const linhas = (resultado.ausentes_otimizacao || [])
                .map(item => [
                    item.servico,
                    formatarLocais(item.linhas)
                ]);

            conteudo.innerHTML = `
                <h3>Serviços ausentes na Otimização</h3>

                ${criarTabela(
                    ["Serviço", "Linhas na Alta Demanda"],
                    linhas,
                    "Nenhum serviço ausente na Otimização."
                )}
            `;
        }

        // ABA 3: AUSENTES NA ALTA DEMANDA
        else if (nome === "ausentes-demanda") {

            const linhas = (resultado.ausentes_demanda || [])
                .map(item => [
                    item.servico,
                    formatarLocais(item.linhas)
                ]);

            conteudo.innerHTML = `
                <h3>Serviços ausentes na Alta Demanda</h3>

                ${criarTabela(
                    ["Serviço", "Linhas na Otimização"],
                    linhas,
                    "Nenhum serviço ausente na Alta Demanda."
                )}
            `;
        }

        // ABA 4: PRÉVIA
        else if (nome === "previa") {

            conteudo.innerHTML = `
                <h3>Prévia das planilhas</h3>

                <p class="mensagem-previa">
                    A visualização das planilhas será integrada
                    nesta aba na próxima etapa.
                </p>
            `;
        }
    }

    // Eventos dos botões das abas
    botoes.forEach(botao => {
        botao.addEventListener("click", () => {
            abrirAba(botao.dataset.aba);
        });
    });

    // Abre a primeira aba automaticamente
    abrirAba("correspondentes");
}

// Formata as linhas e colunas encontradas
function formatarLocais(locais) {
    if (!locais || locais.length === 0) {
        return "Não informado";
    }

    return locais.map(local =>
        `Linha ${local.linha}, coluna ${local.coluna}`
    ).join(" | ");
}

// Inicia a comparação
btnIniciar.addEventListener("click", async () => {
    const programacao = arquivoProgramacao.files[0];
    const otimizacao = arquivoOtimizacao.files[0];

    if (!programacao || !otimizacao) {
        statusComparacao.textContent =
            "Selecione as duas planilhas antes de iniciar.";
        return;
    }

    if (!vigenciaConfirmada || !dadosVigencia) {
        statusComparacao.textContent =
            "Confirme a vigência antes de iniciar.";
        return;
    }

    const dados = new FormData();

    dados.append("programacao", programacao);
    dados.append("otimizacao", otimizacao);
    dados.append("data_inicio", dadosVigencia.data_inicio);
    dados.append("data_fim", dadosVigencia.data_fim);
    dados.append("semanas", dadosVigencia.semanas);

    requisicaoAtual = new AbortController();

    btnIniciar.disabled = true;
    areaResultados.innerHTML = "";

    statusComparacao.textContent = "Comparando as planilhas...";

    try {
        const resposta = await fetch(
            "http://127.0.0.1:5000/api/comparar",
            {
                method: "POST",
                body: dados,
                signal: requisicaoAtual.signal
            }
        );

        const resultado = await resposta.json();

        if (!resposta.ok) {
            throw new Error(resultado.erro || "Erro na comparação.");
        }

        mostrarResultados(resultado);

        statusComparacao.textContent =
            resultado.mensagem || "Comparação concluída.";

    } catch (erro) {
        if (erro.name === "AbortError") {
            statusComparacao.textContent = "Operação interrompida.";
        } else {
            statusComparacao.textContent = "Erro: " + erro.message;
        }
    } finally {
        btnIniciar.disabled = false;
        requisicaoAtual = null;
    }
});

// Interrompe a requisição
btnParar.addEventListener("click", () => {
    if (requisicaoAtual) {
        requisicaoAtual.abort();
    }

    statusComparacao.textContent = "Operação interrompida.";
});
