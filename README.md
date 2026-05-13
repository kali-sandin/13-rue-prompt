# 13 Rue del Prompt

Libro de cómic interactivo para TheOffice: una imagen de libro abierto ocupa toda la pantalla, dos páginas muestran contenido vertical, y otras dos imágenes superiores se pueden ir borrando con el cursor para revelar lo que hay debajo.

## Tecnología

- HTML estático
- CSS separado
- JavaScript separado
- Sin dependencias ni build step

## Dónde copiar las imágenes y sonidos

Copia los assets reales aquí, respetando estos nombres:

```text
assets/book/book-open.png        # libro abierto en blanco, fondo 16:9 recomendado
assets/pages/left-base.png       # contenido oculto página izquierda, vertical
assets/pages/right-base.png      # contenido oculto página derecha, vertical
assets/pages/left-cover.png      # imagen superior borrable izquierda, vertical
assets/pages/right-cover.png     # imagen superior borrable derecha, vertical
assets/audio/erase.mp3           # sonido corto de borrar
assets/audio/music.mp3           # música de fondo en loop
```

El repo trae placeholders para probar la mecánica; puedes sobrescribirlos directamente con los assets definitivos usando los mismos nombres. Los MP3 incluidos son silenciosos de prueba: reemplázalos por el sonido y la música reales.

## Uso local

Abre `index.html` directamente o sirve la carpeta con cualquier servidor estático:

```bash
python3 -m http.server 8080
```

Después abre `http://127.0.0.1:8080`.

## Controles

- **Click/arrastrar sobre una página**: borra circularmente la imagen superior y revela la página base.
- **Reiniciar páginas**: vuelve a cubrir ambas páginas.
- **Pantalla completa**: entra/sale de fullscreen.
- **Sonido**: activa/desactiva música de fondo y sonido de borrar.

## Ajuste de composición

La posición de las páginas vive en `src/styles.css`:

```css
.page {
  top: 13.2%;
  width: 31.4%;
  height: 70.8%;
}
.page-left { left: 15.7%; }
.page-right { right: 15.7%; }
```

Si el libro real tiene márgenes distintos, basta con retocar esos porcentajes.
