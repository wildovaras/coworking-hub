# Coworking Hub

Sistema de gestión inteligente para un centro de coworking, desarrollado como parte del **Proyecto de Diseño de Sistemas de Operaciones** de la Escuela de Ingeniería Civil Industrial de la Universidad de Talca.

**Autores**: Wildo Varas González · Renato Becerra Román
**Profesor**: Sergio González Reyes
**Curicó, Chile · 2026**

## Características

- **OLTP en tiempo real**: gestión de reservas, miembros y cafetería (estilo SAP)
- **Data warehouse histórico**: 250 clientes con 21 atributos (estilo Amazon Redshift)
- **Modelos predictivos** entrenados al iniciar el servidor:
  - Regresión logística — predice re-suscripción de clientes
  - Regresión lineal — predice frecuencia de asistencia y ventas en cafetería
  - K-means (k=4) — segmentación no supervisada
- **KPIs operacionales** adaptados de logística a servicios: IOSA, OEE, fill rate, OTD, MTBF/MTTR
- **Teoría de colas M/M/1** (Heizer Cap. 13) con calculadora interactiva
- **Diseño físico de procesos** según Cap. 5 del informe (método de factores ponderados)
- **Dashboard responsivo** con gráficos Canvas, modales y dropdowns en JavaScript puro

## Stack técnico

- **Backend**: Node.js puro (sin dependencias externas, módulo `http` nativo)
- **Frontend**: HTML, CSS y JavaScript vanilla
- **ML**: implementado en JS puro (gradiente descendente, K-means++)
- **Persistencia**: JSON en disco (OLTP) + warehouse generado con seed reproducible
- **Sin frameworks**: 0 dependencias en `package.json`

## Ejecución local

```bash
node server.js
```

Servidor disponible en `http://localhost:3000`.

## Estructura

```
.
├── server.js               # HTTP server + API REST
├── data_warehouse.js       # Generador de 250 clientes históricos
├── ml.js                   # Algoritmos ML (logística, lineal, K-means)
├── public/
│   ├── index.html          # SPA principal
│   ├── styles.css          # Diseño admin profesional
│   ├── app.js              # Frontend SPA con Canvas charts
│   └── logo.svg
└── package.json
```

## Capítulos del informe implementados

| Capítulo | Implementación |
|---|---|
| 3 — Capacidad | Utilización estacional, peak 8 usuarios/día |
| 4 — Diseño lógico | Diagramas de procesos, CJM 3 actos, integración vertical |
| 5 — Diseño físico | Selección de equipos por método de factores ponderados |

## Despliegue

Configurado para deploy automático en [Render.com](https://render.com) vía `render.yaml`.
