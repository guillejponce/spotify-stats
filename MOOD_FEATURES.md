# Mood & Social Features

Este documento describe las nuevas features de análisis de mood musical y actividad social.

## 🎭 Mood Analysis

### ¿Qué es?

El sistema de mood analysis usa los **audio features** de Spotify (valence, energy, acousticness, etc.) para clasificar y analizar el estado de ánimo de tu música.

### Clasificación de Moods

Basado en el **Circumplex Model of Affect**, clasificamos la música en:

| Mood | Valence | Energy | Descripción |
|------|---------|--------|-------------|
| 🤩 **Euphoric** | Alta (>0.7) | Alta (>0.7) | Música eufórica, party vibes |
| ⚡ **Energetic** | Media-Alta (>0.5) | Alta (>0.6) | Música energética, workout |
| 🔥 **Intense** | Baja (<0.4) | Alta (>0.7) | Música intensa, angry, catártica |
| 😌 **Chill** | Alta (>0.5) | Baja (<0.5) | Música relajada, peaceful |
| 😔 **Melancholic** | Baja (<0.4) | Baja (<0.5) | Música melancólica, sad |
| 🎯 **Focused** | Media | Baja (<0.6) | Música para concentrarse, acústica |
| 😊 **Balanced** | Media | Media | Equilibrio entre diferentes moods |

### Features Implementadas

#### 1. Mood Dashboard (`/mood`)

- **Robot Animado**: Visualiza tu mood actual con un emoji animado
- **Mood Timeline**: Evolución de tu mood a lo largo del tiempo
- **Mood Chart**: Scatter plot de Valence vs Energy
- **Recomendaciones por Mood**: Sugiere canciones de tu biblioteca que matcheen un mood específico

#### 2. Mood Stats en Dashboard Principal

- Widget en el dashboard muestra tu mood actual de la semana
- Se actualiza automáticamente según tu escucha reciente

## 👥 Friend Activity Feed

### ¿Qué es?

Feed en tiempo real de la actividad musical de tus amigos.

### Tipos de Eventos

- 🌟 **New Rating**: Amigo calificó una canción con 8+ estrellas
- 🎉 **Discovered Artist**: Amigo descubrió un artista nuevo
- 🔥 **Listening Streak**: Amigo alcanzó una racha de X días consecutivos
- 👑 **Top Track Changed**: Amigo tiene nueva canción favorita
- 🎊 **Big Milestone**: Logros especiales

### Dónde Ver

- **Dashboard Principal**: Últimos 5 eventos (compacto)
- **Página de Amigos** (`/friends`): Feed completo

## 🔮 Next Big Thing Predictor

### ¿Qué es?

Detecta artistas y canciones en tendencia ascendente basándose en:
- **Growth rate**: % de aumento en escuchas (últimos 30 días vs anteriores 30)
- **Trend score**: Combina growth rate con volumen actual

### Predicciones

| Growth Rate | Predicción |
|-------------|------------|
| +200%+ | "Obsesión nueva detectada 🔥" |
| +100-199% | "En camino a tu top 10" |
| +50-99% | "Tendencia alcista fuerte" |
| +20-49% | "Creciendo consistentemente" |

### Dónde Ver

- **Dashboard Principal**: Widget con top 3 trending artists/tracks
- **API**: `/api/trends/dashboard` para datos completos

## 📊 Diversity Score (en Wrapped)

### ¿Qué mide?

Qué tan variada es tu escucha musical:

- **Artist Diversity**: Ratio de artistas únicos vs total de plays
- **Genre Diversity**: Número de géneros únicos (normalizado)
- **Overall Score**: Promedio ponderado (60% artists, 40% genres)

### Clasificación

| Score | Label |
|-------|-------|
| 80-100% | Explorador |
| 60-79% | Variado |
| 40-59% | Equilibrado |
| 20-39% | Enfocado |
| 0-19% | Monocorde |

### Dónde Ver

- **Wrapped** (`/wrapped`): En la sección de "facts"
- **API**: `/api/diversity/score`

---

## 🚀 Setup & Instalación

### 1. Ejecutar Migraciones SQL

Debes ejecutar los siguientes archivos SQL en tu Supabase SQL Editor:

```bash
# En orden:
1. supabase/mood_analysis.sql
2. supabase/friend_activity.sql
3. supabase/trend_predictions.sql
```

### 2. Poblar Audio Features

Las audio features vienen de la API de Spotify. Ejecuta el script:

```bash
# Poblar features para todos los tracks (límite 1000)
npm run fetch:audio-features

# Solo para un usuario específico
npm run fetch:audio-features -- --user-id=<UUID>

# Con límite personalizado
npm run fetch:audio-features -- --limit=500
```

**Nota**: Este proceso puede tomar varios minutos dependiendo de cuántos tracks tengas.

### 3. Verificar que Funcione

1. Ve a `/mood` - Deberías ver tu mood actual
2. Ve al dashboard principal - Deberías ver el widget de Trending
3. Ve a Wrapped - Deberías ver el Diversity Score en los facts

---

## 📡 API Endpoints

### Mood

```bash
# Mood timeline
GET /api/mood/timeline?period=week&limit=12

# Mood actual
GET /api/mood/current?period=week

# Recomendaciones por mood
GET /api/mood/recommendations?mood=chill&limit=20
```

### Trends

```bash
# Dashboard completo de tendencias
GET /api/trends/dashboard
```

### Diversity

```bash
# Diversity score
GET /api/diversity/score?start_date=2024-01-01&end_date=2024-12-31
```

### Friend Activity

```bash
# Feed de actividad
GET /api/friends/activity?limit=50&offset=0
```

---

## 🔧 Troubleshooting

### "No hay suficientes datos para mostrar el mood"

**Causa**: Tus tracks no tienen audio features en la base de datos.

**Solución**: Ejecuta `npm run fetch:audio-features`

### "No se pudo cargar el timeline"

**Causa**: Falta ejecutar la migración SQL o no hay plays recientes.

**Solución**: 
1. Verifica que ejecutaste `mood_analysis.sql`
2. Asegúrate de tener plays con audio features (ms_played >= 30000)

### Friend Activity está vacío

**Causa**: Tus amigos no han generado eventos recientemente o falta ejecutar migración.

**Solución**:
1. Ejecuta `friend_activity.sql`
2. Los eventos se generan automáticamente cuando amigos califican canciones (8+)
3. Puedes ejecutar `check_listening_streak()` manualmente para generar eventos de racha

### Trending muestra "No hay datos"

**Causa**: No hay suficiente historial de plays para calcular tendencias (necesita al menos 30 días).

**Solución**: Espera a tener más historial o importa datos históricos.

---

## 🎨 Personalización

### Cambiar colores del Mood Robot

Edita `src/components/mood/mood-robot.tsx`:

```typescript
const MOOD_CONFIG = {
  euphoric: {
    emoji: "🤩",
    color: "text-pink-400",  // Cambia aquí
    bgColor: "bg-pink-500/20",
    // ...
  },
  // ...
}
```

### Ajustar umbrales de Mood

Edita `supabase/mood_analysis.sql`, función `classify_mood()`:

```sql
-- Ejemplo: cambiar umbral de euphoric
IF p_energy > 0.7 AND p_valence > 0.7 THEN  -- Cambia estos valores
  RETURN 'euphoric';
END IF;
```

### Cambiar ventana de Trending

Edita `supabase/trend_predictions.sql`, función `get_trending_artists()`:

```sql
DECLARE
  v_period_days integer := 30;  -- Cambia aquí (default: 30 días)
BEGIN
  -- ...
```

---

## 🐛 Debugging

### Ver logs de audio features

```bash
# Durante la ejecución del script
npm run fetch:audio-features 2>&1 | tee audio-features.log
```

### Verificar datos en DB

```sql
-- Contar tracks con audio features
SELECT COUNT(*) FROM track_audio_features;

-- Ver mood snapshot más reciente
SELECT * FROM mood_snapshots 
WHERE user_id = '<UUID>' 
ORDER BY period_start DESC 
LIMIT 1;

-- Ver eventos de amigos
SELECT * FROM friend_activity_events 
ORDER BY created_at DESC 
LIMIT 10;

-- Ver trending artists
SELECT * FROM get_trending_artists('<UUID>', 5);
```

---

## 📝 TODO / Future Features

- [ ] Comparar mood con amigos
- [ ] Playlist automática por mood
- [ ] Notificaciones push de friend activity
- [ ] Export mood data to CSV
- [ ] Mood calendar heatmap
- [ ] AI-generated mood descriptions
- [ ] Mood-based playlist generator
- [ ] Social mood challenges

---

## 🤝 Contributing

Si tienes ideas o encuentras bugs, abre un issue o PR!

## 📄 License

Same as main project.
