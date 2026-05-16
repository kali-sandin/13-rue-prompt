# 13 Rue del Prompt

Libro de cómic interactivo para TheOffice: una portada inicial ocupa toda la pantalla; al primer click suena el paso de página, desaparece la portada y aparece un libro abierto con dos páginas borrables.

## Tecnología

- HTML estático
- CSS separado
- JavaScript separado
- Sin dependencias ni build step

## Dónde copiar las imágenes y sonidos

La carga con intento `.jpg` y fallback `.png` está limitada a:

- portada inicial (`assets/book/cover`)
- contraportada/final (`assets/book/cover-back`)
- imágenes base de contenido de página (`assets/pages/*-base`)

El libro abierto, las capas superiores borrables de cada página y los recursos de UI se cargan como PNG directo.

```text
assets/book/cover.jpg            # portada inicial a pantalla completa
assets/book/cover.png            # fallback de portada inicial
assets/book/cover-back.jpg       # contraportada / final
assets/book/cover-back.png       # fallback de contraportada
assets/book/book-open.png        # libro abierto en blanco, fondo 1672x941 recomendado

assets/pages/left-base.jpg       # contenido oculto página izquierda, vertical
assets/pages/left-base.png       # fallback
assets/pages/right-base.jpg      # contenido oculto página derecha, vertical
assets/pages/right-base.png      # fallback
assets/pages/left-cover.png      # capa superior borrable izquierda, siempre PNG
assets/pages/right-cover.png     # capa superior borrable derecha, siempre PNG
assets/pages/Ibañez.jpg          # imagen homenaje final
assets/pages/mortadelo.png       # imagen pequeña final, abajo derecha

assets/ui/eraser.png             # cursor/botón goma
assets/ui/moneda.png             # cursor/botón moneda

assets/audio/page-flip.mp3       # sonido del primer click / paso de página
assets/audio/erase.mp3           # sonido corto de borrar / arañar
assets/audio/music.mp3           # música de fondo en loop
```

Al iniciar se precargan portada, contraportada, libro abierto y las primeras dos páginas con sus capas superiores para evitar saltos visuales al abrir/pasar página.

## Uso local

```bash
python3 -m http.server 8080
```

Después abre `http://127.0.0.1:8080`.

## Controles

- **Primer click en cualquier sitio**: abre el libro, suena `page-flip.mp3`, activa el cursor de goma y arranca la música en loop con sonido ON.
- **Click/arrastrar sobre una página**: borra circularmente la imagen superior y revela la página base.
- **Reiniciar páginas**: vuelve a cubrir ambas páginas.
- **Pantalla completa**: entra/sale de fullscreen manteniendo los botones visibles.
- **Sonido**: activa/desactiva música de fondo y sonido de borrar; tras abrir la portada queda encendido por defecto.

Las zonas borradas sobreviven a fullscreen, salir de fullscreen y redimensionado; solo se restauran con **Reiniciar páginas**. El libro se muestra siempre completo con `contain` centrado; si sobra espacio por proporción de ventana, aparecen bandas marrones simétricas.

## Geometría actual

La composición parte de un fondo de `1672x941 px` y escala todo proporcionalmente:

```css
.page-left {
  left: 155px;
  top: 35px; /* ajustado para alinear visualmente con la página derecha */
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
