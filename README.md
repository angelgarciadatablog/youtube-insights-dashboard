# YouTube Insights Dashboard

Dashboard web estático que visualiza el rendimiento de un canal de YouTube en tiempo real. Consume los archivos JSON generados por [`youtube-analytics-data-service`](https://github.com/angelgarciachanga/youtube-analytics-data-service) directamente desde Cloud Storage, sin backend propio.

Desplegado en: **[angelgarciadatablog.com/youtube-insights-dashboard](https://angelgarciadatablog.com/youtube-insights-dashboard)**

---

## Arquitectura del proyecto completo

```
YouTube Data API v3
        │
        ▼
youtube-v3-data-pipeline        ← ETL: extrae, transforma y carga en BigQuery
        │
        ▼
youtube-analytics-data-service  ← Servicio: exporta BigQuery → JSON en Cloud Storage
        │
        ▼
youtube-insights-dashboard      ← Este repo: consume los JSON y los visualiza
```

---

## Motivación y decisiones de diseño

### Por qué existe este proyecto

El dashboard nativo de YouTube Analytics no muestra los datos de la forma que necesitaba. El crecimiento de vistas, por ejemplo, solo permite comparar la semana actual contra la anterior, sin histórico acumulado ni contexto por playlist o video. Este proyecto nació para resolver eso: tener visibilidad real del canal con las preguntas de negocio que importan, no las que YouTube decide mostrar.

### Por qué tres repositorios separados

La arquitectura en tres capas fue evolucionando de forma natural a medida que el proyecto crecía. No fue una decisión de diseño inicial, sino el resultado de reconocer que cada capa tiene una responsabilidad distinta y un ciclo de cambio diferente.

La separación tiene una ventaja práctica concreta: si necesito agregar una métrica calculada al dashboard, la implemento como una nueva columna en la query SQL del segundo repo, sin tocar el pipeline ETL del primero. Cada capa es independiente y modificable sin interferir con las demás.

Además, cada repositorio representa un aprendizaje específico:

| Repo | Qué se aprende |
|---|---|
| `youtube-v3-data-pipeline` | Consumo de API, estructura ETL, despliegue de Cloud Functions, organización de un proyecto Python con `main.py` + librerías internas |
| `youtube-analytics-data-service` | Cloud Scheduler, Cloud Storage, exportación de datos, coordinación entre servicios mediante timing |
| `youtube-insights-dashboard` | Visualización de datos, formulación de preguntas de negocio, consumo de endpoints JSON |

### El reto principal: formular las preguntas correctas

La parte técnica —Cloud Functions, Cloud Scheduler, Cloud Storage, consumo de APIs— fue nueva y requirió aprendizaje. Pero el reto más importante no fue técnico: fue aprender a formular adecuadamente las preguntas de negocio.

No se trata solo de escribir queries SQL o generar gráficos. Primero hay que saber qué quieres entender del canal, luego traducirlo en una query que lo responda, y finalmente decidir cuál es la mejor forma de visualizarlo. Ese proceso —de la pregunta al dato, del dato al gráfico— es lo que estructura todo el proyecto.

---

## Secciones del dashboard

### 1. Visión General del Canal (diaria)

Datos actualizados cada día a las ~3:00 AM UTC.

- **KPI cards**: suscriptores totales, vistas totales, videos publicados y nuevas vistas del período
- **Filtro de fechas**: selector libre + presets de 7D, 14D y 30D
- **Crecimiento Acumulado**: línea doble de vistas y suscriptores en el tiempo
- **Nuevas Vistas por Día**: barras con el delta diario de vistas
- **Tasa de Crecimiento de Vistas (%)**: evolución porcentual del ritmo de crecimiento

### 2. Playlists & Videos — Última Semana (semanal)

Ranking del rendimiento durante la semana más reciente, con toggle de métricas: Vistas · Likes · Comentarios · Antigüedad.

- **Vistas Ganadas por Playlist · Top 5**: gráfico de barras horizontal
- **Ranking de playlists**: cards expandibles (accordion) que muestran los videos de cada playlist con su barra de progreso relativa
- **Vistas Ganadas por Video · Top 5**: gráfico de barras horizontal con los videos individualmente más vistos

### 3. Histórico Semanal

Evolución semana a semana con toggle de métricas: Vistas · Likes · Comentarios.

- **Playlists**: gráfico de líneas multi-serie + tabla ordenable por cualquier semana
- **Videos**: gráfico de líneas multi-serie + tabla ordenable por cualquier semana

---

## Stack tecnológico

| Componente | Tecnología |
|---|---|
| Lenguaje | HTML + CSS + JavaScript (vanilla) |
| Gráficos | Chart.js v4.4 + chartjs-plugin-datalabels |
| Datos | JSON públicos desde Cloud Storage (GCP) |
| Despliegue | GitHub Pages |

No hay framework, bundler ni dependencias de npm. Todo corre directamente en el navegador.

---

## Fuentes de datos

Los JSONs se consumen directamente desde el bucket público de Cloud Storage generado por `youtube-analytics-data-service`.

| Sección | Archivo en Cloud Storage | Frecuencia |
|---|---|---|
| Visión General | `daily/view-channel-growth-daily.json` | Diaria |
| Playlists última semana | `weekly/view-playlist-growth-weekly.json` | Semanal |
| Videos última semana | `weekly/view-video-growth-weekly.json` | Semanal |
| Histórico playlists | `weekly/view-playlist-weekly-evolution.json` | Semanal |
| Histórico videos | `weekly/view-video-weekly-evolution-relevant.json` | Semanal |
| Videos por playlist | `weekly/view-all-playlist-videos-weekly.json` | Semanal |

Los datos diarios se actualizan a las 3:00 AM UTC y los semanales los lunes a las 3:30 AM UTC.

---

## Estructura del proyecto

```
youtube-insights-dashboard/
├── index.html    # Estructura del dashboard y skeleton loading
├── app.js        # Lógica de fetching, filtros, charts y renderizado
└── styles.css    # Design system: dark mode, gradiente azul-morado-rosa, responsive
```

---

## Ejecutar localmente

Al ser un sitio estático, basta con servirlo desde cualquier servidor local para evitar restricciones CORS del navegador:

```bash
# Con Python
python -m http.server 8080

# Con Node.js (npx)
npx serve .
```

Luego abrir `http://localhost:8080` en el navegador. Los datos se cargan directamente desde Cloud Storage.

---

## Diseño

- Dark mode nativo (`#0a0a0a` de base)
- Gradiente de acento: azul → morado → rosa (`#2674ed → #7c3aed → #ec4899`)
- Skeleton loading en todos los componentes mientras se cargan los datos
- Responsive mobile-first (grid adaptativo en KPIs y charts)
- Tooltips personalizados en Chart.js

---

## Autor

**Angel Garcia** — [LinkedIn](https://www.linkedin.com/in/angelgarciachanga) · [angelgarciadatablog.com](https://angelgarciadatablog.com)
