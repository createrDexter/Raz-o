
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from openpyxl import load_workbook
from io import BytesIO
from datetime import datetime, date, time
import re

app = Flask(__name__)
CORS(app)


# ========================================
# ARQUIVOS DE TRABALHO EM MEMÓRIA
# ========================================

arquivos_trabalho = {
    "demanda": None,
    "otimizacao": None
}


# ========================================
# NORMALIZAÇÃO DOS SERVIÇOS
# ========================================

def normalizar_servico(valor):
    if valor is None:
        return None

    texto = str(valor).strip()

    if texto.endswith(".0"):
        texto = texto[:-2]

    if texto.isdigit():
        return texto

    return None


def codigo_principal(valor):
    if valor is None:
        return None

    texto = str(valor).strip().split("/", 1)[0].strip()

    return normalizar_servico(texto)


def separar_servicos(valor):
    if valor is None:
        return []

    partes = re.split(r"[/;,]", str(valor))
    resultado = []

    for parte in partes:
        servico = normalizar_servico(parte)

        if servico and servico not in resultado:
            resultado.append(servico)

    return resultado


def valor_json(valor):
    if isinstance(valor, (datetime, date, time)):
        return valor.isoformat()

    return valor


def ordenar_servicos(servicos):
    return sorted(
        servicos,
        key=lambda x: int(x) if str(x).isdigit() else str(x)
    )


# ========================================
# LEITURA DA ALTA DEMANDA
# ========================================

def ler_demanda(arquivo):

    wb = load_workbook(
        BytesIO(arquivo.read()),
        data_only=True,
        read_only=True
    )

    try:
        if "Demanda" not in wb.sheetnames:
            raise ValueError(
                "A aba 'Demanda' não foi encontrada."
            )

        ws = wb["Demanda"]

        todos_servicos = set()
        registros_ho = {}
        total_registros = 0

        for linha, dados in enumerate(
            ws.iter_rows(min_row=16, values_only=True),
            start=16
        ):

            servico_original = dados[3] if len(dados) > 3 else None
            origem = dados[8] if len(dados) > 8 else None
            destino = dados[10] if len(dados) > 10 else None
            tipo = dados[16] if len(dados) > 16 else None
            frota = dados[17] if len(dados) > 17 else None

            if servico_original is None or not str(servico_original).strip():
                continue

            total_registros += 1

            texto_original = str(servico_original).strip()
            todos_servicos.add(texto_original)

            servico_principal = texto_original.split("/", 1)[0].strip()
            servicos = separar_servicos(servico_principal)

            tipo_normalizado = str(tipo or "").strip().upper()

            if tipo_normalizado != "HO":
                continue

            for servico in servicos:

                registro = {
                    "servico": servico,
                    "tipo": tipo_normalizado,
                    "origem": valor_json(origem),
                    "destino": valor_json(destino),
                    "frota": valor_json(frota),
                    "linha": linha,
                    "coluna": "D",
                    "situacao": "ENCONTRADO"
                }

                registros_ho.setdefault(servico, []).append(registro)

        return {
            "todos_servicos": todos_servicos,
            "registros_ho": registros_ho,
            "total_registros": total_registros
        }

    finally:
        wb.close()


# ========================================
# LEITURA DA OTIMIZAÇÃO
# ========================================

def ler_otimizacao(arquivo):

    wb = load_workbook(
        BytesIO(arquivo.read()),
        data_only=True,
        read_only=True
    )

    try:
        if "Cenario" not in wb.sheetnames:
            raise ValueError(
                "A aba 'Cenario' não foi encontrada."
            )

        ws = wb["Cenario"]

        todos_servicos = set()
        registros_ho = {}
        total_registros = 0

        for linha, dados in enumerate(
            ws.iter_rows(min_row=3, values_only=True),
            start=3
        ):

            servico_original = dados[1] if len(dados) > 1 else None
            frota = dados[3] if len(dados) > 3 else None
            tipo = dados[5] if len(dados) > 5 else None
            origem = dados[16] if len(dados) > 16 else None
            destino = dados[17] if len(dados) > 17 else None

            if servico_original is None or not str(servico_original).strip():
                continue

            total_registros += 1

            texto_original = str(servico_original).strip()
            servico_principal = texto_original.split("/", 1)[0].strip()

            todos_servicos.add(servico_principal)
            servicos = separar_servicos(servico_principal)

            tipo_normalizado = str(tipo or "").strip().upper()

            if tipo_normalizado != "HO":
                continue

            for servico in servicos:

                registro = {
                    "servico": servico,
                    "tipo": tipo_normalizado,
                    "origem": valor_json(origem),
                    "destino": valor_json(destino),
                    "frota": valor_json(frota),
                    "linha": linha,
                    "coluna": "B",
                    "situacao": "ENCONTRADO"
                }

                registros_ho.setdefault(servico, []).append(registro)

        return {
            "todos_servicos": todos_servicos,
            "registros_ho": registros_ho,
            "total_registros": total_registros
        }

    finally:
        wb.close()


# ========================================
# LIMPEZA AUTOMÁTICA DE AC ATÉ CO
# ========================================

def limpar_plantao_automaticamente(conteudo_otimizacao):

    wb = load_workbook(
        BytesIO(conteudo_otimizacao)
    )

    try:
        if "Cenario" not in wb.sheetnames:
            raise ValueError(
                "A aba 'Cenario' não foi encontrada."
            )

        ws = wb["Cenario"]

        celulas_limpas = 0

        # Começa na linha 3 e vai até a última linha.
        # Coluna 29 = AC.
        # Coluna 93 = CO.
        # Limpa todas as linhas, sem verificar tipo ou serviço.

        for linha in range(3, ws.max_row + 1):

            for coluna in range(29, 94):

                celula = ws.cell(linha, coluna)

                if celula.value is not None:
                    celula.value = None
                    celulas_limpas += 1

        saida = BytesIO()
        wb.save(saida)

        return saida.getvalue(), celulas_limpas

    finally:
        wb.close()


# ========================================
# EXECUTAR COMPARAÇÃO
# ========================================

def executar_comparacao(conteudo_demanda, conteudo_otimizacao):

    demanda = ler_demanda(BytesIO(conteudo_demanda))
    otimizacao = ler_otimizacao(BytesIO(conteudo_otimizacao))

    demanda_ho = demanda["registros_ho"]
    otimizacao_ho = otimizacao["registros_ho"]

    servicos_demanda = set(demanda_ho.keys())
    servicos_otimizacao = set(otimizacao_ho.keys())

    correspondentes_ids = servicos_demanda & servicos_otimizacao
    ausentes_otimizacao_ids = servicos_demanda - servicos_otimizacao
    ausentes_demanda_ids = servicos_otimizacao - servicos_demanda

    correspondentes = []

    for servico in ordenar_servicos(correspondentes_ids):

        correspondentes.append({
            "servico": servico,
            "situacao": "ENCONTRADO",
            "linhas_demanda": demanda_ho[servico],
            "linhas_otimizacao": otimizacao_ho[servico],
            "tipo_demanda": "HO",
            "tipos_otimizacao": ["HO"]
        })

    ausentes_otimizacao = []

    for servico in ordenar_servicos(ausentes_otimizacao_ids):

        for registro in demanda_ho[servico]:

            item = registro.copy()
            item["situacao"] = "AUSENTE NA OTIMIZAÇÃO"

            ausentes_otimizacao.append(item)

    ausentes_demanda = []

    for servico in ordenar_servicos(ausentes_demanda_ids):

        registros = otimizacao_ho[servico]

        if not registros:
            continue

        primeiro = registros[0]
        ultimo = registros[-1]

        item = primeiro.copy()

        item["origem"] = primeiro["origem"]
        item["destino"] = ultimo["destino"]

        item["linha"] = (
            f'{primeiro["linha"]}–{ultimo["linha"]}'
        )

        item["situacao"] = "AUSENTE NA ALTA DEMANDA"

        ausentes_demanda.append(item)

    resumo = {
        "total_demanda": len(demanda["todos_servicos"]),
        "total_otimizacao": len(otimizacao["todos_servicos"]),
        "total_registros_demanda": demanda["total_registros"],
        "total_registros_otimizacao": otimizacao["total_registros"],
        "total_ho_demanda": len(servicos_demanda),
        "total_ho_otimizacao": len(servicos_otimizacao),
        "correspondentes": len(correspondentes_ids),
        "ausentes_otimizacao": len(ausentes_otimizacao_ids),
        "ausentes_demanda": len(ausentes_demanda_ids)
    }

    return {
        "mensagem": "Comparação realizada com sucesso.",
        "resumo": resumo,
        "correspondentes": correspondentes,
        "ausentes_otimizacao": ausentes_otimizacao,
        "ausentes_demanda": ausentes_demanda
    }


# ========================================
# STATUS DA API
# ========================================

@app.route("/api/status", methods=["GET"])
def status():

    return jsonify({
        "status": "online",
        "mensagem": "Robô Nietzsche funcionando."
    })


# ========================================
# COMPARAÇÃO INICIAL
# ========================================

@app.route("/api/comparar", methods=["POST"])
def comparar():

    try:
        if "programacao" not in request.files:
            return jsonify({
                "erro": "Arquivo de Alta Demanda não enviado."
            }), 400

        if "otimizacao" not in request.files:
            return jsonify({
                "erro": "Arquivo de Otimização não enviado."
            }), 400

        conteudo_demanda = request.files["programacao"].read()
        conteudo_otimizacao = request.files["otimizacao"].read()

        # Primeiro realiza a comparação com os arquivos originais.
        resultado = executar_comparacao(
            conteudo_demanda,
            conteudo_otimizacao
        )

        # Depois limpa AC até CO de todas as linhas, a partir da 3.
        otimizacao_limpa, celulas_limpas = (
            limpar_plantao_automaticamente(
                conteudo_otimizacao
            )
        )

        # Guarda a Alta Demanda original.
        arquivos_trabalho["demanda"] = conteudo_demanda

        # Guarda a Otimização já limpa.
        arquivos_trabalho["otimizacao"] = otimizacao_limpa

        resultado["limpeza_automatica"] = {
            "celulas_limpas": celulas_limpas,
            "intervalo": "AC3:CO"
        }

        return jsonify(resultado)

    except Exception as erro:

        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# EDITAR SERVIÇO NA OTIMIZAÇÃO
# ========================================

@app.route("/api/editar-otimizacao", methods=["POST"])
def editar_otimizacao():

    try:
        if arquivos_trabalho["otimizacao"] is None:
            return jsonify({
                "erro": "Faça a comparação primeiro."
            }), 400

        dados = request.get_json(silent=True) or {}

        servico_antigo = codigo_principal(
            dados.get("servico")
        )

        novo_codigo = re.sub(
            r"\s*/\s*",
            "/",
            str(dados.get("novo_codigo", "")).strip()
        )

        if not servico_antigo or not re.fullmatch(
            r"\d+(?:/\d+)?",
            novo_codigo
        ):
            return jsonify({
                "erro": "Informe os códigos corretamente."
            }), 400

        wb = load_workbook(
            BytesIO(arquivos_trabalho["otimizacao"])
        )

        try:
            if "Cenario" not in wb.sheetnames:
                return jsonify({
                    "erro": "A aba 'Cenario' não foi encontrada."
                }), 400

            ws = wb["Cenario"]
            alteracoes = 0

            for linha in range(3, ws.max_row + 1):

                tipo = str(
                    ws.cell(linha, 6).value or ""
                ).strip().upper()

                if tipo != "HO":
                    continue

                valor_atual = ws.cell(linha, 2).value
                principal = codigo_principal(valor_atual)

                if principal == servico_antigo:

                    ws.cell(linha, 2).value = novo_codigo
                    alteracoes += 1

            if alteracoes == 0:
                return jsonify({
                    "erro": "Serviço não encontrado na Otimização."
                }), 404

            saida = BytesIO()
            wb.save(saida)

            arquivos_trabalho["otimizacao"] = saida.getvalue()

            return jsonify({
                "mensagem": "Serviço editado na Otimização com sucesso.",
                "servico_anterior": servico_antigo,
                "novo_codigo": novo_codigo,
                "linhas_alteradas": alteracoes
            })

        finally:
            wb.close()

    except Exception as erro:

        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# EXCLUIR SERVIÇOS DA OTIMIZAÇÃO
# ========================================

@app.route("/api/excluir-otimizacao", methods=["POST"])
def excluir_otimizacao():

    try:
        if arquivos_trabalho["otimizacao"] is None:
            return jsonify({
                "erro": "Faça a comparação primeiro."
            }), 400

        dados = request.get_json(silent=True) or {}
        servicos = dados.get("servicos", [])

        if not isinstance(servicos, list) or not servicos:
            return jsonify({
                "erro": "Selecione pelo menos um serviço."
            }), 400

        servicos_excluir = {
            codigo_principal(servico)
            for servico in servicos
            if codigo_principal(servico)
        }

        if not servicos_excluir:
            return jsonify({
                "erro": "Nenhum código válido foi informado."
            }), 400

        wb = load_workbook(
            BytesIO(arquivos_trabalho["otimizacao"])
        )

        try:
            if "Cenario" not in wb.sheetnames:
                return jsonify({
                    "erro": "A aba 'Cenario' não foi encontrada."
                }), 400

            ws = wb["Cenario"]
            linhas_excluidas = 0

            for linha in range(ws.max_row, 2, -1):

                tipo = str(
                    ws.cell(linha, 6).value or ""
                ).strip().upper()

                if tipo != "HO":
                    continue

                valor_atual = ws.cell(linha, 2).value
                principal = codigo_principal(valor_atual)

                if principal in servicos_excluir:

                    ws.delete_rows(linha, 1)
                    linhas_excluidas += 1

            if linhas_excluidas == 0:
                return jsonify({
                    "erro": "Nenhuma linha correspondente encontrada."
                }), 404

            saida = BytesIO()
            wb.save(saida)

            arquivos_trabalho["otimizacao"] = saida.getvalue()

            return jsonify({
                "mensagem": "Serviços excluídos com sucesso.",
                "servicos_excluidos": ordenar_servicos(servicos_excluir),
                "linhas_excluidas": linhas_excluidas
            })

        finally:
            wb.close()

    except Exception as erro:

        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# ATUALIZAR COMPARAÇÃO
# ========================================

@app.route("/api/recomparar", methods=["GET"])
def recomparar():

    try:
        if (
            arquivos_trabalho["demanda"] is None
            or arquivos_trabalho["otimizacao"] is None
        ):
            return jsonify({
                "erro": "Faça a comparação primeiro."
            }), 400

        # Compara a versão atual da Otimização.
        resultado = executar_comparacao(
            arquivos_trabalho["demanda"],
            arquivos_trabalho["otimizacao"]
        )

        # Garante novamente a limpeza de AC até CO.
        otimizacao_limpa, celulas_limpas = (
            limpar_plantao_automaticamente(
                arquivos_trabalho["otimizacao"]
            )
        )

        arquivos_trabalho["otimizacao"] = otimizacao_limpa

        resultado["limpeza_automatica"] = {
            "celulas_limpas": celulas_limpas,
            "intervalo": "AC3:CO"
        }

        return jsonify(resultado)

    except Exception as erro:

        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# BAIXAR PLANILHA FINAL
# ========================================

@app.route("/api/baixar-otimizacao", methods=["GET"])
def baixar_otimizacao():

    try:
        if (
            arquivos_trabalho["demanda"] is None
            or arquivos_trabalho["otimizacao"] is None
        ):
            return jsonify({
                "erro": "Faça a comparação primeiro."
            }), 400

        # A planilha já foi limpa na comparação.
        # O download entrega diretamente a versão armazenada.

        arquivo_saida = BytesIO(
            arquivos_trabalho["otimizacao"]
        )

        arquivo_saida.seek(0)

        resposta = send_file(
            arquivo_saida,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name="Otimizacao_atualizada.xlsx"
        )

        return resposta

    except Exception as erro:

        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# INICIAR SERVIDOR
# ========================================

if __name__ == "__main__":
    app.run(debug=True, port=5000)
