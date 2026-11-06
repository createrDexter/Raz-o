from flask import Flask, request, jsonify
from flask_cors import CORS
from openpyxl import load_workbook
from io import BytesIO
from datetime import datetime, date, time
import re

app = Flask(__name__)
CORS(app)


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
    return sorted(servicos, key=lambda x: int(x) if x.isdigit() else x)


# ========================================
# LEITURA DA ALTA DEMANDA
# ========================================


def ler_demanda(arquivo):
    wb = load_workbook(
        BytesIO(arquivo.read()),
        data_only=True,
        read_only=True
    )

    if "Demanda" not in wb.sheetnames:
        raise ValueError("A aba 'Demanda' não foi encontrada.")

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

                # Conta todas as linhas, inclusive MNT_R
        total_registros += 1

        # Na Otimização, considera somente o código antes da barra (/)
        servico_principal = str(servico_original).split("/", 1)[0].strip()
        servicos = separar_servicos(servico_principal)

        # Total geral: códigos numéricos e não numéricos
        todos_servicos.add(str(servico_original).strip())

        # Comparação somente HO
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

    wb.close()

    return {
        "todos_servicos": todos_servicos,
        "registros_ho": registros_ho,
        "total_registros": total_registros
    }
# ========================================
# LEITURA DA OTIMIZAÇÃO
# ========================================


def ler_otimizacao(arquivo):
    wb = load_workbook(
        BytesIO(arquivo.read()),
        data_only=True,
        read_only=True
    )

    if "Cenario" not in wb.sheetnames:
        raise ValueError("A aba 'Cenario' não foi encontrada.")

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

        # Conta todas as linhas, inclusive MNT_R
        total_registros += 1

        # Considera exclusivamente o código antes da barra (/)
        servico_principal = str(servico_original).split("/", 1)[0].strip()

        servicos = separar_servicos(servico_principal)

        # Total geral: considera somente o serviço principal
        todos_servicos.add(servico_principal)
        # Comparação somente HO
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

    wb.close()

    return {
        "todos_servicos": todos_servicos,
        "registros_ho": registros_ho,
        "total_registros": total_registros
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
# COMPARAÇÃO
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

        arquivo_demanda = request.files["programacao"]
        arquivo_otimizacao = request.files["otimizacao"]

        demanda = ler_demanda(arquivo_demanda)
        otimizacao = ler_otimizacao(arquivo_otimizacao)

        demanda_ho = demanda["registros_ho"]
        otimizacao_ho = otimizacao["registros_ho"]

        servicos_demanda = set(demanda_ho.keys())
        servicos_otimizacao = set(otimizacao_ho.keys())

        correspondentes_ids = (
            servicos_demanda & servicos_otimizacao
        )

        ausentes_otimizacao_ids = (
            servicos_demanda - servicos_otimizacao
        )

        ausentes_demanda_ids = (
            servicos_otimizacao - servicos_demanda
        )

        # ========================================
        # CORRESPONDENTES
        # ========================================

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

        # ========================================
        # AUSENTES NA OTIMIZAÇÃO
        # ========================================

        ausentes_otimizacao = []

        for servico in ordenar_servicos(ausentes_otimizacao_ids):
            for registro in demanda_ho[servico]:

                item = registro.copy()
                item["situacao"] = "AUSENTE NA OTIMIZAÇÃO"

                ausentes_otimizacao.append(item)

                # ========================================
        # AUSENTES NA ALTA DEMANDA
        # AGRUPADOS POR SERVIÇO
        # ========================================

        ausentes_demanda = []

        for servico in ordenar_servicos(ausentes_demanda_ids):

            registros = otimizacao_ho[servico]

            if not registros:
                continue

            # Primeira e última ocorrência do serviço
            primeiro = registros[0]
            ultimo = registros[-1]

            item = primeiro.copy()

            # Monta o trajeto completo
            item["origem"] = primeiro["origem"]
            item["destino"] = ultimo["destino"]

            # Mostra o intervalo das linhas na Otimização
            item["linha"] = (
                f'{primeiro["linha"]}–{ultimo["linha"]}'
            )

            item["situacao"] = "AUSENTE NA ALTA DEMANDA"

            ausentes_demanda.append(item)

        # ========================================
        # RESUMO
        # ========================================

        resumo = {
            # Totais gerais: todos os tipos
            "total_demanda": len(demanda["todos_servicos"]),
            "total_otimizacao": len(otimizacao["todos_servicos"]),

            # Totais de registros nas planilhas
            "total_registros_demanda": demanda["total_registros"],
            "total_registros_otimizacao": otimizacao["total_registros"],

            # Comparação: somente HO
            "total_ho_demanda": len(servicos_demanda),
            "total_ho_otimizacao": len(servicos_otimizacao),
            "correspondentes": len(correspondentes_ids),
            "ausentes_otimizacao": len(ausentes_otimizacao_ids),
            "ausentes_demanda": len(ausentes_demanda_ids)
        }

        return jsonify({
            "mensagem": "Comparação realizada com sucesso.",
            "resumo": resumo,
            "correspondentes": correspondentes,
            "ausentes_otimizacao": ausentes_otimizacao,
            "ausentes_demanda": ausentes_demanda
        })

    except Exception as erro:
        return jsonify({
            "erro": str(erro)
        }), 500


# ========================================
# INICIAR SERVIDOR
# ========================================

if __name__ == "__main__":
    app.run(debug=True, port=5000)