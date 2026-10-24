# Cerebro Universal RGGR IA

Aplicación web Node.js con consultas a la API de OpenAI.

## Despliegue
- Comando de inicio: `npm start`
- Variable requerida en el alojamiento: `OPENAI_API_KEY`
- Variable opcional: `OPENAI_MODEL` (por defecto `gpt-6-luna`)
- La plataforma de alojamiento proporciona normalmente `PORT`.

## Seguridad
- Nunca subas `.env` ni una clave API al repositorio.
- El servidor limita las consultas a 10 por minuto por IP como protección básica.
- Configura límites de uso y presupuesto en la plataforma de OpenAI; el limitador básico no sustituye esos controles.
