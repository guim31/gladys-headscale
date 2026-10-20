# Headscale

Siga las máquinas de su servidor [Headscale](https://headscale.net) en Gladys:
un dispositivo por máquina (en línea o no, última conexión, días antes de que
caduque su clave, rutas anunciadas y activadas), un dispositivo «Headscale» con
las máquinas en línea y en total, un widget para el panel y disparadores de
escena cuando una máquina pasa a fuera de línea, vuelve, o cuando su clave está
a punto de caducar.

Headscale es el servidor de coordinación libre y autoalojado compatible con los
clientes de Tailscale. Esta integración está pensada para quienes **alojan su
propio servidor Headscale**; no lee el servicio en la nube de Tailscale. Se ha
probado con servidores Headscale reales 0.22.3, 0.23.0, 0.26.1 y 0.29.5 en
Docker, con clientes Tailscale registrados y luego detenidos. Sus comentarios
son bienvenidos en el [foro de Gladys](https://community.gladysassistant.com) o
en las [issues](https://github.com/guim31/gladys-headscale/issues).

## Qué necesita

- Gladys Assistant 5.1.0 o posterior.
- Un servidor Headscale, versión 0.22 o posterior, accesible desde Gladys: su
  dirección pública (`server_url`) o su dirección y su puerto en su red (8080
  por defecto).
- Una clave de API de este servidor. Gladys solo lee: no modifica nada en
  Headscale.

## Configuración

1. En el servidor Headscale, cree una clave de API (ver más abajo) y cópiela:
   solo se muestra una vez.
2. En Gladys, instale la integración y abra su pantalla **Configuración**.
3. **Dirección del servidor**: el `server_url` de Headscale
   (`https://headscale.example.com`), o su dirección IP y su puerto
   (`192.168.1.2:8080`). Una dirección sin `http://` ni `https://` se lee como
   http, en el puerto 8080 si no se indica ninguno.
4. **Clave de API**: la clave creada en el paso 1.
5. **Aceptar un certificado autofirmado**: solo para una dirección https cuyo
   certificado no está firmado por una autoridad conocida.
6. **Usuarios a seguir**: nombres de usuario de Headscale, separados por comas.
   Vacío: las máquinas de todos los usuarios.
7. **Publicar las direcciones IP**: desactivado por defecto. Activado, cada
   máquina recibe una función **Direcciones IP** con sus direcciones del
   tailnet.
8. **Intervalo de actualización**: 1 minuto por defecto. Cada lectura cuesta
   una solicitud (dos antes de Headscale 0.26).
9. **Idioma de los nombres**: el idioma de los nombres de las funciones y de
   las fechas, francés por defecto.
10. Guarde y pulse **Probar la conexión**: indica cuántas máquinas se siguen y
    están en línea. Los dispositivos aparecen entonces en la pestaña
    **Descubrimiento** de la integración: añada los que desee.

### La clave de API

En el servidor Headscale (o en su contenedor):

```sh
headscale apikeys create --expiration 365d
```

Sin `--expiration`, la clave caduca a los 90 días, y Gladys muestra entonces
«Clave de API rechazada». `headscale apikeys list` lista las claves y su
caducidad, `headscale apikeys expire --prefix <prefijo>` revoca una. La clave da
acceso completo a la API de Headscale: guárdela para usted. La integración
solo lee la lista de máquinas (y de rutas antes de 0.26).

### ¿Qué dirección?

Gladys llama a Headscale desde su contenedor Docker. Si Headscale funciona en
la misma máquina, indique la dirección de la máquina en su red, nunca
`127.0.0.1`. Detrás de un proxy inverso, la dirección pública `https://`
también funciona.

## Los dispositivos

**Headscale** (un dispositivo):

| Función           | Qué muestra                                    |
| ----------------- | ---------------------------------------------- |
| Máquinas en línea | Máquinas conectadas al servidor ahora mismo    |
| Máquinas          | Máquinas seguidas (tras el filtro de usuarios) |

**Cada máquina** (su nombre en Headscale, seguido de `(Headscale)`):

| Función              | Qué muestra                                                                         |
| -------------------- | ----------------------------------------------------------------------------------- |
| En línea             | Sí mientras la máquina mantiene su conexión con el servidor                         |
| Vista por última vez | Cuándo pasó a fuera de línea; en línea, cuándo se conectó                           |
| La clave caduca en   | Días antes de que caduque la clave de la máquina, 0 una vez caducada                |
| Rutas anunciadas     | Rutas de subred que anuncia la máquina (el nodo de salida cuenta como una)          |
| Rutas activadas      | De ellas, las aprobadas en el servidor                                              |
| Direcciones IP       | Sus direcciones del tailnet, solo con **Publicar las direcciones IP** (desactivado) |

**La clave caduca en** solo existe para una máquina cuya clave caduca:
Headscale puede desactivar la caducidad por máquina
(`headscale nodes expire --disable` en las versiones recientes), y las máquinas
con etiquetas a menudo no la tienen. Si una clave empieza a caducar más tarde,
Gladys propone **Actualizar** en la pestaña Descubrimiento. Una máquina que
cierra sesión (logout) recibe una clave caducada en Headscale: muestra 0.

Una máquina se identifica por su ID de Headscale: borrarla de Headscale y
registrarla de nuevo crea un dispositivo nuevo en Gladys.

## Panel

El widget **Máquinas Headscale** muestra las máquinas en línea y en total, y
luego una fila por máquina: primero aquellas cuya clave caduca en menos de 7
días (en naranja, en rojo una vez caducada), luego las que están en línea y
después las demás, con la hora en que se vieron por última vez.

## Escenas

### Disparadores

- **Máquina Headscale fuera de línea**: una máquina ha dejado el servidor
  (apagada, fuera de la red, sesión cerrada).
- **Máquina Headscale de nuevo en línea**: una máquina se ha vuelto a conectar.
- **Clave de máquina a punto de caducar**: la clave de una máquina caduca en
  30, 14, 7, 3 o 1 día(s), o acaba de caducar. Su filtro
  **Días restantes (vacío: cualquiera)** retiene una de estas etapas.

Cada disparador puede limitarse a una máquina (**Máquina (vacío: cualquiera)**)
o a las máquinas de un usuario
(**Usuario de Headscale (vacío: cualquiera)**, el nombre exacto). Ofrecen las
variables **Nombre de la máquina** y **Usuario de Headscale**, y además
**Días restantes** y **Fecha de caducidad** para la clave. No se envía ningún
evento en la primera lectura tras un arranque o un cambio de configuración, ni
para una máquina que acaba de aparecer: el estado anterior es desconocido. Las
etapas de la clave se detectan mientras la integración funciona: una etapa
superada mientras estaba detenida no se envía después. Un cierre de sesión (logout, que hace caducar la clave en Headscale) solo dispara **Máquina Headscale fuera de línea**.

### Ideas de escenas

- Cuando la clave de una máquina caduque en 7 días, envíese un mensaje con su
  **Nombre de la máquina** y su **Fecha de caducidad**, para renovarla a
  tiempo.
- Cuando el NAS remoto que guarda sus copias de seguridad pase a fuera de
  línea, envíe un mensaje.
- Cuando el teléfono de un miembro de la familia vuelva a estar en línea en el
  tailnet, por la tarde, encienda la luz de la entrada.

## Solución de problemas

- **«Clave de API rechazada»**: la clave está mal copiada, revocada o caducada
  (90 días por defecto): cree una nueva.
- **«Headscale no responde»**: compruebe la dirección y el puerto, y que Gladys
  puede alcanzarlos (cortafuegos, `127.0.0.1` desde un contenedor).
- **«Certificado rechazado»**: el certificado https no está firmado por una
  autoridad conocida. Si es el suyo, active
  **Aceptar un certificado autofirmado**.
- **«No hay ninguna API de Headscale en esta dirección»**: la dirección lleva a
  otro servicio (la página de inicio de sesión del proxy inverso, el puerto de
  métricas…) o a un Headscale anterior a 0.22.
- **Ninguna máquina en la pestaña Descubrimiento**: pulse
  **Probar la conexión**; si ninguna máquina pertenece a los usuarios de la
  configuración, compruebe sus nombres (o vacíe el campo).

## Límites

- Un único servidor Headscale por instalación de la integración.
- Gladys acepta 300 estados por minuto: en un tailnet de más de unas 50 máquinas, los primeros valores tardan algunas lecturas en llegar.
- Solo lectura: la integración no aprueba rutas, no renueva claves ni borra
  máquinas. Eso sigue siendo cosa del comando `headscale` o de su interfaz web.
- **En línea** es lo que dice Headscale: una máquina está en línea mientras su
  conexión con el servidor está abierta, lo que no dice nada del tráfico entre
  máquinas.
- Las etapas de **Clave de máquina a punto de caducar** no se guardan: una
  etapa superada mientras la integración estaba detenida se pierde.
- Sin relación con el proyecto Headscale ni con Tailscale Inc. Tailscale es una
  marca de Tailscale Inc.
