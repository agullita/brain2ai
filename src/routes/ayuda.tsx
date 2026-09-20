import { createFileRoute } from "@tanstack/react-router";
import {
  Bell,
  FileAudio,
  FileText,
  ListChecks,
  ListTodo,
  Mail,
  NotebookPen,
  Search,
  FolderOpen,
  KeyRound,
  Smartphone,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export const Route = createFileRoute("/ayuda")({
  head: () => ({
    meta: [
      { title: "Ayuda y tutorial · Brain2ai" },
      {
        name: "description",
        content:
          "Tutorial paso a paso para usar Brain2ai: grabación de reuniones, resúmenes con IA, Notebook, tablero Kanban, correos HTML y búsqueda global.",
      },
      { property: "og:title", content: "Ayuda y tutorial · Brain2ai" },
      {
        property: "og:description",
        content: "Aprende a usar toda la herramienta: reuniones, notas, tareas y correos, todo en local.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AyudaPage,
});

type Paso = { titulo: string; texto: ReactNode };

function Seccion({
  icon: Icon,
  titulo,
  intro,
  pasos,
  tips,
  abierto,
  onToggle,
}: {
  icon: typeof FileAudio;
  titulo: string;
  intro: string;
  pasos: readonly Paso[];
  tips: string[] | undefined;
  abierto: boolean;
  onToggle: () => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-muted/40"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-base font-semibold tracking-tight">
            {titulo}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{intro}</span>
        </span>
        <ChevronRight
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${
            abierto ? "rotate-90" : ""
          }`}
        />
      </button>
      {abierto && (
        <div className="space-y-4 border-t border-border/70 p-5 pt-4">
          <ol className="space-y-3">
            {pasos.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0 text-sm leading-relaxed">
                  <p className="font-medium">{p.titulo}</p>
                  <p className="mt-0.5 text-muted-foreground">{p.texto}</p>
                </div>
              </li>
            ))}
          </ol>
          {tips && tips.length > 0 && (
            <div className="rounded-xl bg-primary/5 p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
                <Sparkles className="size-3.5" /> Trucos
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {tips.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const SECCIONES = [
  {
    id: "inicio",
    icon: KeyRound,
    titulo: "Primeros pasos: clave de Gemini y carpeta local",
    intro: "Configura la app en dos minutos antes de empezar.",
    pasos: [
      {
        titulo: "Consigue tu clave de Gemini",
        texto: "Entra en Google AI Studio (aistudio.google.com), inicia sesión con tu cuenta de Google y pulsa «Get API key» para crear una clave gratuita. Cópiala.",
      },
      {
        titulo: "Guárdala en la app",
        texto: "En Grabar Reunión (o en Notebook y Correos) pulsa el engranaje de ajustes y pega la clave. Se guarda solo en tu navegador; nadie más la ve y no pasa por ningún servidor nuestro.",
      },
      {
        titulo: "Elige tu carpeta (opcional pero recomendado)",
        texto: "Pulsa «Elegir carpeta» en la parte inferior del menú y selecciona una carpeta de tu ordenador. A partir de ahí, tus tareas, notas y correos se guardan también como archivos .json en esa carpeta: tu copia de seguridad personal.",
      },
      {
        titulo: "Copia de seguridad: descargar y restaurar",
        texto: "Con «Descargar copia de seguridad» obtienes un archivo .json con todas tus notas, tareas, actas y ajustes. En otro ordenador (o después de borrar el navegador), pulsa «Restaurar copia de seguridad», elige ese archivo y todo vuelve a su sitio. Ojo: la restauración reemplaza lo que haya en ese momento.",
      },
      {
        titulo: "Empieza con una plantilla",
        texto: "En el Notebook, el desplegable «Nueva nota con plantilla…» crea la nota ya estructurada: reunión general, 1:1, daily, reunión con cliente, brainstorm, evaluación o incidencias. Rellena los huecos y las casillas pendientes se pueden mandar al Kanban.",
      },
      {
        titulo: "Instálala como app",
        texto: "En Chrome o Edge, abre el menú del navegador y elige «Instalar app». La tendrás en el escritorio como un programa más, con su propio icono.",
      },
    ],
    tips: [
      "Todo funciona sin conexión excepto las funciones de IA (transcripción, resúmenes, correos), que llaman directamente a Google con tu clave.",
      "La barra «Espacio» del menú muestra cuánto ocupan tus grabaciones y actas.",
    ],
  },
  {
    id: "actas",
    icon: FileAudio,
    titulo: "Grabar Reunión: grabar y sacar el acta",
    intro: "Graba o sube un audio, transcribe y genera el acta con acuerdos y tareas.",
    pasos: [
      {
        titulo: "Graba la reunión",
        texto: "Pulsa el botón de grabar y deja el micrófono cerca de los interlocutores. Mientras grabas puedes tomar notas rápidas en el panel lateral: se guardan con la reunión.",
      },
      {
        titulo: "…o sube un audio ya grabado",
        texto: "Si la reunión ya pasó, sube el archivo (MP3, M4A, WAV u OGG). La app lo trocea y lo transcribe igual que una grabación en directo.",
      },
      {
        titulo: "Enseña tu voz (opcional)",
        texto: "En ajustes puedes grabar una muestra de 8 segundos de tu voz. La IA la usará para etiquetarte como «Yo» en la transcripción y distinguirte del resto de hablantes.",
      },
      {
        titulo: "Genera el acta",
        texto: "Al terminar, pulsa «Generar acta». La IA escribe un resumen con decisiones y acuerdos, y extrae automáticamente las tareas al tablero Kanban (columna «Bandeja de entrada»).",
      },
      {
        titulo: "Busca, pregunta y exporta",
        texto: "Desde cada acta puedes hacer preguntas a la IA sobre lo que se dijo, copiar o exportar el acta en Markdown, y borrar el audio para liberar espacio conservando el texto.",
      },
    ],
    tips: [
      "La transcripción se hace por fragmentos de 40 segundos: en reuniones largas verás cómo aparece el texto poco a poco.",
      "Cuanta menos ruido de fondo, mejor reconocimiento de hablantes. Un micrófono externo mejora mucho el resultado.",
    ],
  },
  {
    id: "importar",
    icon: FileText,
    titulo: "Importar transcripción: acta sin grabar",
    intro: "Si la reunión ya tiene transcripción (Teams, Meet, Zoom), pégala y obtén el acta.",
    pasos: [
      {
        titulo: "Copia o descarga la transcripción",
        texto: "En Teams, Meet o Zoom abre la transcripción de la reunión y cópiala, o descarga el archivo (.txt, .vtt o .srt).",
      },
      {
        titulo: "Pégala en «Importar transcripción»",
        texto: "En el menú, entra en «Importar transcripción», pon un título y pega el texto o pulsa «Subir archivo». Los códigos de tiempo se limpian solos.",
      },
      {
        titulo: "Genera el acta",
        texto: "Pulsa «Generar acta»: la IA escribe el resumen, lo guarda junto al resto de tus reuniones y envía las tareas a la Bandeja de entrada del Kanban.",
      },
    ],
    tips: [
      "Es la forma más rápida y precisa de tener acta de una reunión de Teams, porque el texto ya viene limpio.",
      "También sirve para notas de voz transcritas por otra herramienta o para actas antiguas en texto.",
    ],
  },
  {
    id: "tareas",
    icon: ListTodo,
    titulo: "Tareas: el tablero Kanban",
    intro: "Organiza todo lo que hay que hacer en cuatro columnas.",
    pasos: [
      {
        titulo: "Conoce las columnas",
        texto: "«Bandeja de entrada» recibe las tareas que la IA extrae de tus actas y notas. De ahí las mueves a Pendiente, En camino o Hecho según avancen.",
      },
      {
        titulo: "Crea tarjetas a mano",
        texto: "Escribe en la caja de arriba y pulsa añadir. La primera línea es el título y el resto, el detalle.",
      },
      {
        titulo: "Arrastra texto desde fuera",
        texto: "Selecciona texto en un correo, un documento o una web y arrástralo directamente sobre el tablero: se convierte en tarjeta nueva sin copiar y pegar.",
      },
      {
        titulo: "Mueve y completa",
        texto: "Arrastra las tarjetas entre columnas. Al pasar una a «Hecho» guarda la fecha de finalización, y desde ahí puedes borrarla.",
      },
      {
        titulo: "Vincula tu archivo .json",
        texto: "Si elegiste carpeta, el tablero se guarda en ella automáticamente. También puedes vincular un archivo .json propio para llevarlo contigo.",
      },
    ],
    tips: [
      "Revisa la «Bandeja de entrada» al final de cada reunión: edita lo que la IA haya entendido mal antes de moverlo.",
    ],
  },
  {
    id: "notas",
    icon: NotebookPen,
    titulo: "Notebook: notas y grabación en un mismo espacio",
    intro: "Un bloc estilo Notion con carpetas, plantillas, etiquetas y enlace directo a tus tareas.",
    pasos: [
      {
        titulo: "Organiza con carpetas",
        texto: "En el panel lateral crea carpetas (por proyecto, cliente, tema…) y guarda cada nota donde corresponda. Puedes ocultar el panel para escribir a pantalla completa.",
      },
      {
        titulo: "Crea una nota con plantilla",
        texto: "Pulsa «Nueva nota» (el título se rellena solo con fecha y hora) o elige antes una plantilla: reunión general, 1:1, daily, reunión con cliente, brainstorm, evaluación o incidencias.",
      },
      {
        titulo: "Renombrala cuando quieras",
        texto: "Pasa el ratón por la nota en el panel lateral y pulsa el lápiz para cambiarle el nombre; también puedes editar el título desde la cabecera de la nota abierta.",
      },
      {
        titulo: "Arrastra notas a carpetas",
        texto: "Arrastra cualquier nota de la lista y suéltala sobre una carpeta para moverla (o sobre «Todas las notas» para sacarla). La carpeta se resalta al pasar por encima.",
      },
      {
        titulo: "Escribe con formato",
        texto: "Usa la barra de herramientas para negritas, listas, tablas y casillas de verificación. Es Markdown: también puedes escribir **, - o [ ] a mano. Con el icono del ojo ocultas la vista previa y te quedas solo con el editor a pantalla completa.",
      },
      {
        titulo: "Etiqueta con # y menciona con @",
        texto: "Escribe #proyecto o #urgente y se convierten en píldoras que filtran notas. Escribe @ para insertar una referencia a una tarea de tu tablero.",
      },
      {
        titulo: "Lienzo de Reunión: notas y grabación a la vez",
        texto: "Al abrir una nota de reunión, el editor ocupa la izquierda y el panel de grabación la derecha (se puede plegar). Puedes escribir a mano mientras se transcribe el audio en vivo: conviven las dos fuentes.",
      },
      {
        titulo: "Terminar y sintetizar",
        texto: "Pulsa «Terminar y sintetizar» y la IA combinará tus notas manuales (la estructura y prioridades) con la transcripción bruta (los detalles técnicos) en un acta final que se añade al pie de la nota, con sus tareas a la Bandeja de entrada del Kanban.",
      },
      {
        titulo: "Extrae acciones al Kanban",
        texto: "El botón «Extraer acciones al Kanban» envía la nota a Gemini y convierte lo accionable en tarjetas de la «Bandeja de entrada», con aviso de confirmación.",
      },
    ],
    tips: [
      "El buscador del panel filtra por título, contenido, fecha y etiqueta en tiempo real.",
      "Las notas también aparecen en la búsqueda global (Ctrl+K).",
    ],
  },
  {
    id: "foco",
    icon: ListChecks,
    titulo: "Next 3 Actions: foco diario",
    intro: "Elige solo tres cosas para hoy y trabájalas con temporizador.",
    pasos: [
      {
        titulo: "Define tus 3 prioridades",
        texto: "Añade hasta un máximo de tres tarjetas: lo importante de hoy. El límite es a propósito, para obligarte a priorizar.",
      },
      {
        titulo: "Usa el Parking Lot",
        texto: "Todo lo que surja y no sea de hoy va al Parking Lot: lo aparcas sin perderlo y sin que te distraiga.",
      },
      {
        titulo: "Trabaja con temporizador",
        texto: "Pon bloques de 15, 30 o 45 minutos a cada tarjeta para mantener el ritmo.",
      },
      {
        titulo: "Cierra la jornada",
        texto: "Al terminar, «Cierre de jornada» genera un resumen en Markdown (hecho, pendiente, aparcado) listo para copiar y pegar donde quieras.",
      },
    ],
  },
  {
    id: "correos",
    icon: Mail,
    titulo: "Correos HTML: emails con diseño",
    intro: "Redacta correos con IA y diseño de marca, listos para pegar en Outlook.",
    pasos: [
      {
        titulo: "Redacta con Gemini",
        texto: "Describe el correo que necesitas («aviso de cambio de horario a los vecinos…») y la IA lo redacta con asunto y cuerpo.",
      },
      {
        titulo: "Personaliza los colores",
        texto: "En el engranaje de ajustes puedes cambiar, añadir o restaurar los colores corporativos (los Pantone de tus emails). Se aplican a toda la plantilla.",
      },
      {
        titulo: "Pide un diseño a tu medida",
        texto: "En «Diseño del correo» escribe cómo lo quieres («cabecera de color, dos columnas, más moderno») o pega el HTML de un correo que te guste para que lo imite. Con «Volver a la plantilla original» deshaces el cambio.",
      },
      {
        titulo: "Copia y pega en Outlook",
        texto: "El botón «Copiar HTML» copia el correo con formato. Al pegarlo en Outlook se conservan la tabla, los colores y el botón de llamada a acción.",
      },
    ],
    tips: [
      "El borrador se guarda automáticamente en tu carpeta local: puedes cerrar la app y seguir otro día.",
    ],
  },
  {
    id: "busqueda",
    icon: Search,
    titulo: "Búsqueda global (Ctrl+K)",
    intro: "Encuentra cualquier cosa en toda la app al instante.",
    pasos: [
      {
        titulo: "Ábrela desde cualquier sitio",
        texto: "Pulsa Ctrl+K (Cmd+K en Mac) o la lupa del menú lateral, estés en la pantalla que estés.",
      },
      {
        titulo: "Escribe y mira",
        texto: "Los resultados aparecen mientras tecleas, agrupados por tipo: tareas, actas, notas e ideas del Parking Lot, con un extracto donde se resalta tu palabra.",
      },
      {
        titulo: "Abre el resultado",
        texto: "Al hacer clic en una tarea se abre su ficha completa; en un acta, la vista de lectura íntegra; en una nota, salta directamente a ella.",
      },
    ],
  },
  {
    id: "carpeta",
    icon: FolderOpen,
    titulo: "Tu carpeta local y privacidad",
    intro: "Dónde viven tus datos y cómo funcionan las copias.",
    pasos: [
      {
        titulo: "Todo es tuyo",
        texto: "La app no tiene servidores ni cuentas de usuario. Grabaciones y actas viven en el almacenamiento interno del navegador; tareas, notas y correos, además, en la carpeta que elijas.",
      },
      {
        titulo: "Los archivos .json",
        texto: "En tu carpeta verás archivos como tareas.json y notas.json. Son texto legible: puedes abrirlos, copiarlos a otro ordenador o archivarlos como copia de seguridad.",
      },
      {
        titulo: "Cambiar o soltar la carpeta",
        texto: "Pulsa «Elegir carpeta» para cambiarla, o «Dejar de guardar en la carpeta» para desvincularla: la app seguirá guardando todo internamente.",
      },
    ],
    tips: [
      "Tu clave de Gemini solo sale de tu equipo para hablar con los servidores de Google. Nunca pasa por Lovable ni por terceros.",
    ],
  },
  {
    id: "recordatorios",
    icon: Bell,
    titulo: "Recordatorios con fecha límite",
    intro: "Pon fechas a tus tarjetas y deja que el navegador te avise.",
    pasos: [
      {
        titulo: "Pon una fecha a una tarjeta",
        texto: "En el tablero de Tareas, pulsa el icono del calendario en cualquier tarjeta y elige el día límite. Verás un chip con la fecha en la propia tarjeta.",
      },
      {
        titulo: "Activa los recordatorios",
        texto: "Pulsa «Activar recordatorios» arriba del tablero y acepta el permiso del navegador. Solo se pide una vez.",
      },
      {
        titulo: "Recibe los avisos",
        texto: "Cada tarea con fecha de hoy o vencida genera una notificación del sistema al abrir la app y cada hora que la tengas abierta, hasta que la marques como hecha.",
      },
    ],
    tips: [
      "Los colores del chip te orientan: rojo si ya venció, destacado si vence hoy o mañana, gris para el resto.",
      "Para quitar una fecha, vuelve a abrir el calendario y pulsa «Quitar fecha».",
    ],
  },
  {
    id: "exportar",
    icon: FileText,
    titulo: "Exportar a PDF y Word",
    intro: "Lleva tus actas y notas fuera de la app con dos clics.",
    pasos: [
      {
        titulo: "En un acta",
        texto: "Con la reunión abierta, usa los botones «PDF» y «Word» de la cabecera. El PDF se genera desde la ventana de impresión (elige «Guardar como PDF»); el Word se descarga como archivo .doc listo para abrir.",
      },
      {
        titulo: "En una nota",
        texto: "En el Notebook, los dos últimos iconos de la barra del editor (documento y Word) exportan la nota con su formato actual: negritas, listas, tablas y casillas.",
      },
      {
        titulo: "Comparte tranquilo",
        texto: "Los archivos se generan en tu propio ordenador, sin pasar por ningún servidor. Incluyen el título, la fecha y todo el contenido, con la transcripción al final en el caso de las actas.",
      },
    ],
    tips: [
      "Si el PDF no se abre, revisa que el navegador permita ventanas emergentes para esta app.",
    ],
  },
  {
    id: "movil",
    icon: Smartphone,
    titulo: "En el móvil: grabadora de bolsillo",
    intro: "Abre la app en el teléfono y tendrás solo lo esencial para grabar y compartir.",
    pasos: [
      {
        titulo: "Detección automática",
        texto: "Si abres la app desde el móvil, se abre directamente una pantalla sencilla de grabación, con el botón grande, el cronómetro y el nivel de sonido.",
      },
      {
        titulo: "Graba y revisa",
        texto: "Cada grabación queda en la lista con su duración; puedes escucharla antes de enviarla.",
      },
      {
        titulo: "Comparte el audio",
        texto: "En cada grabación, «Enviar audio» usa el menú de compartir del móvil (WhatsApp, Telegram, correo…) con botones sueltos como alternativa, o lo descarga si tu navegador no permite compartir.",
      },
      {
        titulo: "Pasa a la app completa",
        texto: "El enlace «Abrir la app completa» te lleva a la versión de escritorio dentro del móvil, por si necesitas el resto de funciones.",
      },
    ],
    tips: [
      "Las grabaciones hechas en el móvil se guardan en el propio teléfono; para transcribirlas y generar el acta, compártelas o ábrelas después en el ordenador.",
    ],
  },
] as const;

function AyudaPage() {
  const [abierta, setAbierta] = useState<string>("inicio");

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Ayuda y tutorial
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Cómo usar Brain2ai
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Tu centro de trabajo local: graba reuniones, saca actas y tareas con IA, toma notas y
            envía correos con diseño. Todo se guarda en tu ordenador. Despliega cada sección para
            ver el paso a paso.
          </p>
        </header>

        <div className="space-y-3">
          {SECCIONES.map((s) => (
            <Seccion
              key={s.id}
              icon={s.icon}
              titulo={s.titulo}
              intro={s.intro}
              pasos={s.pasos}
              tips={"tips" in s ? [...s.tips] : undefined}
              abierto={abierta === s.id}
              onToggle={() => setAbierta(abierta === s.id ? "" : s.id)}
            />
          ))}
        </div>

        <footer className="mt-8 rounded-2xl border border-dashed border-border p-5 text-center">
          <p className="text-sm text-muted-foreground">
            ¿Atascado? Recuerda: <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-semibold">Ctrl+K</kbd>{" "}
            busca en toda la app, y el engranaje de cada pantalla guarda tu clave de Gemini.
          </p>
        </footer>
      </div>
    </main>
  );
}
