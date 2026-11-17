from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from openpyxl import load_workbook
from openpyxl.formula.translate import Translator
from openpyxl.styles import PatternFill
from copy import copy
from io import BytesIO
from datetime import datetime, date, time, timedelta
import re

app = Flask(__name__)
CORS(app)


# ========================================
# ARQUIVOS DE TRABALHO EM MEMÓRIA
# ========================================

arquivos_trabalho = {
    "demanda": None,
    "otimizacao": None,
    "vigencia": None
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
# TRATAMENTO DAS DATAS DE VIGÊNCIA
# ========================================

def converter_data(valor):

    if isinstance(valor, datetime):
        return valor.date()

    if isinstance(valor, date):
        return valor

    if valor is None:
        return None

    texto = str(valor).strip()

    formatos = [
        "%d/%m/%Y",
        "%Y-%m-%d",
        "%d-%m-%Y"
    ]

    for formato in formatos:
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue

    return None


def validar_vigencia(data_inicio, data_fim, semanas):

    inicio = converter_data(data_inicio)
    fim = converter_data(data_fim)

    if not inicio or not fim:
        raise ValueError(
            "Informe corretamente a data inicial e a data final."
        )

    if inicio.weekday() != 2:
        raise ValueError(
            "A data inicial da vigência precisa ser uma quarta-feira."
        )

    if fim != inicio + timedelta(days=6):
        raise ValueError(
            "A primeira semana precisa terminar na terça-feira, "
            "seis dias depois da data inicial."
        )

    try:
        quantidade = int(semanas)
    except (TypeError, ValueError):
        raise ValueError("Informe a quantidade de semanas.")

    if quantidade < 1 or quantidade > 4:
        raise ValueError(
            "A quantidade de semanas deve ser de 1 a 4."
        )

    return inicio, fim, quantidade


# ========================================
# APLICAR VIGÊNCIA E DUPLICAR PROGRAMAÇÃO
# ========================================

def aplicar_vigencia_e_duplicar(
    conteudo_otimizacao,
    data_inicio,
    data_fim,
    semanas
):
    """Aplica a vigência e replica o bloco delimitado pelas cores da coluna B."""

    inicio, fim, quantidade_semanas = validar_vigencia(
        data_inicio,
        data_fim,
        semanas
    )

    wb = load_workbook(BytesIO(conteudo_otimizacao))

    try:
        if "Cenario" not in wb.sheetnames:
            raise ValueError("A aba 'Cenario' não foi encontrada.")

        ws = wb["Cenario"]

        def rgb_da_celula(celula):
            cor = celula.fill.fgColor
            if cor.type == "rgb" and cor.rgb:
                return str(cor.rgb)[-6:].upper()
            return None

        def eh_marcador_inicio(celula):
            rgb = rgb_da_celula(celula)
            if not rgb:
                return False

            vermelho = int(rgb[0:2], 16)
            verde = int(rgb[2:4], 16)
            azul = int(rgb[4:6], 16)

            return (
                azul >= 120
                and azul > vermelho * 1.20
                and azul > verde * 1.05
            )

        def eh_marcador_fim(celula):
            rgb = rgb_da_celula(celula)
            if not rgb:
                return False

            vermelho = int(rgb[0:2], 16)
            verde = int(rgb[2:4], 16)
            azul = int(rgb[4:6], 16)

            return (
                vermelho >= 150
                and verde <= 130
                and azul <= 130
            )

        linhas_com_servico_planilha = [
            linha for linha in range(3, ws.max_row + 1)
            if ws.cell(linha, 2).value is not None
            and str(ws.cell(linha, 2).value).strip()
        ]

        if not linhas_com_servico_planilha:
            raise ValueError(
                "Não encontrei serviços na coluna B para montar "
                "o bloco da primeira semana."
            )

        primeira_linha_detectada = linhas_com_servico_planilha[0]
        ultima_linha_detectada = linhas_com_servico_planilha[-1]

        marcadores_existentes_inicio = [
            linha for linha in range(3, ws.max_row + 1)
            if eh_marcador_inicio(ws.cell(linha, 2))
        ]

        marcadores_existentes_fim = [
            linha for linha in range(3, ws.max_row + 1)
            if eh_marcador_fim(ws.cell(linha, 2))
        ]

        if not marcadores_existentes_inicio or not marcadores_existentes_fim:
            ws.cell(primeira_linha_detectada, 2).fill = PatternFill(
                fill_type="solid",
                fgColor="FF0070C0"
            )

            ws.cell(ultima_linha_detectada, 2).fill = PatternFill(
                fill_type="solid",
                fgColor="FFC00000"
            )

        marcadores_inicio = []
        marcadores_fim = []

        for linha in range(3, ws.max_row + 1):
            celula_servico = ws.cell(linha, 2)

            if eh_marcador_inicio(celula_servico):
                marcadores_inicio.append(linha)

            if eh_marcador_fim(celula_servico):
                marcadores_fim.append(linha)

        if not marcadores_inicio or not marcadores_fim:
            raise ValueError(
                "O Nietzsche não conseguiu criar ou reconhecer "
                "as marcas do bloco na coluna B."
            )

        primeira_linha_bloco = marcadores_inicio[0]

        finais_validos = [
            linha for linha in marcadores_fim
            if linha >= primeira_linha_bloco
        ]

        if not finais_validos:
            raise ValueError(
                "A célula vermelha de encerramento aparece antes "
                "do início do bloco."
            )

        ultima_linha_bloco = finais_validos[0]

        if ultima_linha_bloco < primeira_linha_bloco:
            raise ValueError(
                "O intervalo identificado para o bloco é inválido."
            )

        total_linhas_originais = (
            ultima_linha_bloco - primeira_linha_bloco + 1
        )

        linhas_com_servico = [
            linha
            for linha in range(
                primeira_linha_bloco,
                ultima_linha_bloco + 1
            )
            if ws.cell(linha, 2).value is not None
            and str(ws.cell(linha, 2).value).strip()
        ]

        if not linhas_com_servico:
            raise ValueError(
                "Não foram encontrados serviços dentro do bloco marcado."
            )

        datas_base = [
            converter_data(ws.cell(linha, 26).value)
            for linha in range(
                primeira_linha_bloco,
                ultima_linha_bloco + 1
            )
        ]

        datas_base = [data for data in datas_base if data]

        if not datas_base:
            datas_base = [
                converter_data(ws.cell(linha, 27).value)
                for linha in range(
                    primeira_linha_bloco,
                    ultima_linha_bloco + 1
                )
            ]

            datas_base = [data for data in datas_base if data]

        if not datas_base:
            raise ValueError(
                "Não encontrei datas válidas nas colunas Z ou AA "
                "dentro do bloco marcado."
            )

        menor_data_bloco = min(datas_base)
        maior_data_bloco = max(datas_base)

        if (maior_data_bloco - menor_data_bloco).days > 6:
            raise ValueError(
                "A planilha de Otimização enviada já contém mais "
                "de uma semana no bloco marcado (datas de "
                f"{menor_data_bloco.strftime('%d/%m/%Y')} a "
                f"{maior_data_bloco.strftime('%d/%m/%Y')}). "
                "Envie a planilha original, antes de aplicar a vigência. "
                "O Nietzsche interrompeu o processamento para não "
                "duplicar semanas nem gerar datas incorretas."
            )

        data_base_original = menor_data_bloco
        deslocamento_inicial = (inicio - data_base_original).days

        for linha in range(
            primeira_linha_bloco,
            ultima_linha_bloco + 1
        ):
            for coluna in (26, 27):
                celula = ws.cell(linha, coluna)
                data_original = converter_data(celula.value)

                if data_original:
                    celula.value = data_original + timedelta(
                        days=deslocamento_inicial
                    )

        bloco_original = []
        alturas_originais = []

        for linha in range(
            primeira_linha_bloco,
            ultima_linha_bloco + 1
        ):
            dados_linha = []

            for coluna in range(1, 28):
                celula = ws.cell(linha, coluna)

                dados_linha.append({
                    "value": celula.value,
                    "style": copy(celula._style) if celula.has_style else None,
                    "number_format": celula.number_format,
                    "comment": copy(celula.comment) if celula.comment else None,
                    "hyperlink": copy(celula.hyperlink) if celula.hyperlink else None
                })

            bloco_original.append(dados_linha)

            dimensao = ws.row_dimensions[linha]

            alturas_originais.append({
                "height": dimensao.height,
                "hidden": dimensao.hidden,
                "outlineLevel": dimensao.outlineLevel,
                "collapsed": dimensao.collapsed,
                "thickTop": dimensao.thickTop,
                "thickBot": dimensao.thickBot
            })

        quantidade_copias = quantidade_semanas - 1
        linhas_a_inserir = total_linhas_originais * quantidade_copias

        if linhas_a_inserir and ultima_linha_bloco < ws.max_row:
            ws.insert_rows(
                ultima_linha_bloco + 1,
                linhas_a_inserir
            )

        ultima_linha_final = ultima_linha_bloco

        for numero_copia in range(1, quantidade_semanas):

            primeira_linha_copia = (
                ultima_linha_bloco + 1
                + (numero_copia - 1) * total_linhas_originais
            )

            deslocamento_copia = numero_copia * 7

            for indice, dados_linha in enumerate(bloco_original):

                linha_destino = primeira_linha_copia + indice

                for coluna, dados_celula in enumerate(
                    dados_linha,
                    start=1
                ):
                    destino = ws.cell(linha_destino, coluna)

                    destino.value = dados_celula["value"]

                    if dados_celula["style"] is not None:
                        destino._style = copy(dados_celula["style"])

                    destino.number_format = dados_celula["number_format"]

                    destino.comment = (
                        copy(dados_celula["comment"])
                        if dados_celula["comment"]
                        else None
                    )

                    destino._hyperlink = (
                        copy(dados_celula["hyperlink"])
                        if dados_celula["hyperlink"]
                        else None
                    )

                    valor = dados_celula["value"]

                    if isinstance(valor, str) and valor.startswith("="):
                        try:
                            origem_coord = ws.cell(
                                primeira_linha_bloco + indice,
                                coluna
                            ).coordinate

                            destino.value = Translator(
                                valor,
                                origin=origem_coord
                            ).translate_formula(destino.coordinate)

                        except Exception:
                            destino.value = valor

                dimensao = ws.row_dimensions[linha_destino]
                propriedades = alturas_originais[indice]

                dimensao.height = propriedades["height"]
                dimensao.hidden = propriedades["hidden"]
                dimensao.outlineLevel = propriedades["outlineLevel"]
                dimensao.collapsed = propriedades["collapsed"]
                dimensao.thickTop = propriedades["thickTop"]
                dimensao.thickBot = propriedades["thickBot"]

                for coluna_data in (26, 27):
                    celula = ws.cell(linha_destino, coluna_data)
                    data_copiada = converter_data(celula.value)

                    if data_copiada:
                        celula.value = data_copiada + timedelta(
                            days=deslocamento_copia
                        )

            ultima_linha_final = (
                primeira_linha_copia + total_linhas_originais - 1
            )

        if ws.auto_filter.ref:
            ws.auto_filter.ref = f"A2:CO{ws.max_row}"

        saida = BytesIO()
        wb.save(saida)

        return saida.getvalue(), {
            "data_inicio": inicio.strftime("%d/%m/%Y"),
            "data_fim": fim.strftime("%d/%m/%Y"),
            "semanas": quantidade_semanas,
            "copias_criadas": quantidade_copias,
            "primeira_linha": primeira_linha_bloco,
            "ultima_linha_original": ultima_linha_bloco,
            "linhas_originais": total_linhas_originais,
            "total_linhas": ws.max_row - 2
        }

    finally:
        wb.close()


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

            if (
                servico_original is None
                or not str(servico_original).strip()
            ):
                continue

            total_registros += 1

            texto_original = str(servico_original).strip()
            todos_servicos.add(texto_original)

            servico_principal = (
                texto_original.split("/", 1)[0].strip()
            )

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

                registros_ho.setdefault(
                    servico,
                    []
                ).append(registro)

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

            if (
                servico_original is None
                or not str(servico_original).strip()
            ):
                continue

            total_registros += 1

            texto_original = str(servico_original).strip()

            servico_principal = (
                texto_original.split("/", 1)[0].strip()
            )

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

                registros_ho.setdefault(
                    servico,
                    []
                ).append(registro)

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

    wb = load_workbook(BytesIO(conteudo_otimizacao))

    try:
        if "Cenario" not in wb.sheetnames:
            raise ValueError(
                "A aba 'Cenario' não foi encontrada."
            )

        ws = wb["Cenario"]
        celulas_limpas = 0

        # Limpa todas as informações de AC até CO,
        # começando na linha 3.
        # Preserva A até AB.
        # Não exclui linhas e não altera a formatação.

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

    correspondentes_ids = (
        servicos_demanda & servicos_otimizacao
    )

    ausentes_otimizacao_ids = (
        servicos_demanda - servicos_otimizacao
    )

    ausentes_demanda_ids = (
        servicos_otimizacao - servicos_demanda
    )

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

        data_inicio = request.form.get("data_inicio")
        data_fim = request.form.get("data_fim")
        semanas = request.form.get("semanas")

        inicio, fim, quantidade_semanas = validar_vigencia(
            data_inicio,
            data_fim,
            semanas
        )

        # A comparação acontece antes da duplicação.
        resultado = executar_comparacao(
            conteudo_demanda,
            conteudo_otimizacao
        )

        # Ajusta a vigência e cria as cópias.
        otimizacao_vigenciada, dados_vigencia = (
            aplicar_vigencia_e_duplicar(
                conteudo_otimizacao,
                inicio,
                fim,
                quantidade_semanas
            )
        )

        # Limpa todas as células de AC:CO, da linha 3 até o final.
        otimizacao_limpa, celulas_limpas = (
            limpar_plantao_automaticamente(
                otimizacao_vigenciada
            )
        )

        arquivos_trabalho["demanda"] = conteudo_demanda
        arquivos_trabalho["otimizacao"] = otimizacao_limpa
        arquivos_trabalho["vigencia"] = dados_vigencia

        resultado["vigencia"] = dados_vigencia

        resultado["limpeza_automatica"] = {
            "celulas_limpas": celulas_limpas,
            "intervalo": "AC:CO em todas as linhas, a partir da linha 3"
        }

        return jsonify(resultado)

    except Exception as erro:
        return jsonify({"erro": str(erro)}), 500


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

        if (
            not servico_antigo
            or not re.fullmatch(r"\d+(?:/\d+)?", novo_codigo)
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
        return jsonify({"erro": str(erro)}), 500


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

            if ws.auto_filter.ref:
                ws.auto_filter.ref = f"A2:CO{ws.max_row}"

            saida = BytesIO()
            wb.save(saida)

            arquivos_trabalho["otimizacao"] = saida.getvalue()

            return jsonify({
                "mensagem": "Serviços excluídos com sucesso.",
                "servicos_excluidos": ordenar_servicos(
                    servicos_excluir
                ),
                "linhas_excluidas": linhas_excluidas
            })

        finally:
            wb.close()

    except Exception as erro:
        return jsonify({"erro": str(erro)}), 500


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

        # Reutiliza a planilha já ajustada e duplicada.
        # Não aplica a duplicação novamente.
        resultado = executar_comparacao(
            arquivos_trabalho["demanda"],
            arquivos_trabalho["otimizacao"]
        )

        # Reaplica a limpeza por segurança.
        otimizacao_limpa, celulas_limpas = (
            limpar_plantao_automaticamente(
                arquivos_trabalho["otimizacao"]
            )
        )

        arquivos_trabalho["otimizacao"] = otimizacao_limpa

        resultado["limpeza_automatica"] = {
            "celulas_limpas": celulas_limpas,
            "intervalo": "AC:CO em todas as linhas, a partir da linha 3"
        }

        resultado["vigencia"] = arquivos_trabalho["vigencia"]

        return jsonify(resultado)

    except Exception as erro:
        return jsonify({"erro": str(erro)}), 500


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

        arquivo_saida = BytesIO(
            arquivos_trabalho["otimizacao"]
        )

        arquivo_saida.seek(0)

        resposta = send_file(
            arquivo_saida,
            mimetype=(
                "application/vnd.openxmlformats-officedocument."
                "spreadsheetml.sheet"
            ),
            as_attachment=True,
            download_name="Otimizacao_atualizada.xlsx"
        )

        return resposta

    except Exception as erro:
        return jsonify({"erro": str(erro)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)