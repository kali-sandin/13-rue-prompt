# 13 Rue del Prompt

Libro de cómic interactivo para TheOffice: una portada inicial ocupa toda la pantalla; al primer click suena el paso de página, desaparece la portada y aparece un libro abierto con dos páginas borrables.

## Tecnología

- HTML estático
- CSS separado
- JavaScript separado
- Sin dependencias ni build step

## Dónde copiar las imágenes y sonidos

El código intenta cargar primero `.jpg`; si no existe, usa `.png` como fallback transparente para el usuario.

```text
assets/book/cover.jpg            # portada inicial a pantalla completa
assets/book/cover.png            # fallback de portada inicial
assets/book/book-open.jpg        # libro abierto en blanco, fondo 1672x941 recomendado
assets/book/book-open.png        # fallback del libro abierto

assets/pages/left-base.jpg       # contenido oculto página izquierda, vertical
assets/pages/left-base.png       # fallback
assets/pages/right-base.jpg      # contenido oculto página derecha, vertical
assets/pages/right-base.png      # fallback
assets/pages/left-cover.jpg      # capa superior borrable izquierda, vertical
assets/pages/left-cover.png      # fallback
assets/pages/right-cover.jpg     # capa superior borrable derecha, vertical
assets/pages/right-cover.png     # fallback

assets/ui/eraser.png             # cursor personalizado de goma, con transparencia

assets/audio/page-flip.mp3       # sonido del primer click / paso de página
assets/audio/erase.mp3           # sonido corto de borrar
assets/audio/music.mp3           # música de fondo en loop
```

El repo trae placeholders para probar la mecánica; sobrescríbelos con los assets definitivos usando esos nombres.

## Uso local

```bash
python3 -m http.server 8080
```

Después abre `http://127.0.0.1:8080`.

## Controles

- **Primer click en cualquier sitio**: abre el libro, suena `page-flip.mp3` y activa el cursor de goma.
- **Click/arrastrar sobre una página**: borra circularmente la imagen superior y revela la página base.
- **Reiniciar páginas**: vuelve a cubrir ambas páginas.
- **Pantalla completa**: entra/sale de fullscreen manteniendo los botones visibles.
- **Sonido**: activa/desactiva música de fondo y sonido de borrar.

Las zonas borradas sobreviven a fullscreen, salir de fullscreen y redimensionado; solo se restauran con **Reiniciar páginas**.

## Geometría actual

La composición parte de un fondo de `1672x941 px` y escala todo proporcionalmente:

```css
.page-left {
  left: 155px;
  top: 55px;
  width: 666px;
  height: 868px;
}

.page-right {
  left: 850px;
  top: 35px;
  width: 666px;
  height: 868px;
}
```

En CSS está expresado como porcentajes calculados contra `1672x941` para que mantenga posición al escalar.
