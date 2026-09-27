🔭 SkyPointer / AstroSolver

Aplicación web móvil para asistencia y guiado astronómico mediante Plate Solving (resolución astrométrica de campo). Permite apuntar un telescopio, puntero o trípode hacia cualquier objeto celeste a partir de una simple fotografía del cielo tomada con el smartphone.

🚀 Cómo funciona

El sistema opera en 4 fases automáticas:

Adquisición y Georreferenciación:

Obtiene la ubicación del observador ($\text{Latitud}$ y $\text{Longitud}$) mediante el GPS del dispositivo.

Captura una fotografía nocturna del cielo (1–2 s de exposición, ISO alto, enfoque al infinito).

Comprime y redimensiona la captura en el navegador (1280 px máximo) para transferirla rápidamente mediante datos móviles.

Resolución Astrométrica (Plate Solving):

El cliente envía la imagen a una función serverless en Netlify (/.netlify/functions/solve).

La función gestiona la autenticación segura contra la API de nova.astrometry.net evitando bloqueos por CORS.

El motor astrométrico extrae los centroides estelares, detecta patrones geométricos de triángulos y devuelve las coordenadas ecuatoriales exactas del centro de la imagen: Ascensión Recta (RA) y Declinación (Dec).

Conversión a Coordenadas Horizontales Locales:

Con la hora exacta UTC y la longitud local, el sistema calcula el Tiempo Sidéreo Local (LST):


$$\text{LST} = \text{GMST} + \lambda$$

Se deduce el Ángulo Horario (HA) para el centro actual y para el objeto objetivo:


$$\text{HA} = \text{LST} - \text{RA}$$

Mediante trigonometría esférica se calculan las coordenadas horizontales ($\text{Altitud}$, $\text{Azimut}$):


$$\sin(\text{Alt}) = \sin(\phi)\sin(\text{Dec}) + \cos(\phi)\cos(\text{Dec})\cos(\text{HA})$$

$$\cos(\text{Az}) = \frac{\sin(\text{Dec}) - \sin(\phi)\sin(\text{Alt})}{\cos(\phi)\cos(\text{Alt})}$$

Instrucciones de Guía:

Se calculan las diferencias angulares directas:


$$\Delta\text{Alt} = \text{Alt}_{\text{objetivo}} - \text{Alt}_{\text{actual}}$$

$$\Delta\text{Az} = \text{Az}_{\text{objetivo}} - \text{Az}_{\text{actual}}$$

La pantalla muestra los grados exactos a subir/bajar y girar para centrar el objeto en el campo de visión.

📂 Estructura del Proyecto

├── netlify.toml              # Configuración de build y rutas de Netlify
├── package.json              # Dependencias del backend serverless
├── README.md                 # Documentación del proyecto
├── netlify/
│   └── functions/
│       └── solve.js          # Función serverless (proxy API Astrometry + cálculo trigonométrico)
└── public/
    └── index.html            # Interfaz web móvil (cámara, GPS y visualización)


🛠️ Requisitos e Instalación

Requisitos previos

Una cuenta gratuita y una clave API en nova.astrometry.net.

Cuenta en GitHub y Netlify.

Configuración local

# Clonar el repositorio
git clone https://github.com/TU_USUARIO/sky-pointer.git
cd sky-pointer

# Instalar dependencias
npm install


🌐 Despliegue en Netlify

Sube tu código a GitHub.

Inicia sesión en Netlify y selecciona "Add new site" > "Import an existing project".

Selecciona tu repositorio de GitHub.

En Site configuration > Environment variables, añade tu clave de API:

ASTROMETRY_API_KEY: tu_clave_de_astrometry

Pulsa en Deploy site.

Nota: La aplicación requiere servirse bajo HTTPS (provisto automáticamente por Netlify) para que Safari en iOS autorice el acceso a la cámara y a la geolocalización por GPS.

📱 Consejos de Captura con el Móvil

Soporte rígido: Fija el smartphone al tubo del telescopio o al cabezal del trípode; evita mover el dispositivo durante el disparo.

Modo manual: Desactiva el modo nocturno automático computacional si es posible. Utiliza 1 a 2 segundos de tiempo de exposición con el enfoque fijado al infinito.

Lente principal (1x): Utiliza siempre el sensor principal (habitualmente f/1.5 a f/1.8), ya que capta la mayor cantidad de luz estelar.
