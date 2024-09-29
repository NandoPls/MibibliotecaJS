// Variables globales
let pdfDoc = null;
let currentPage = 1;
let totalPages = 0;
let pageRendering = false;
let scale = 1.5;
let currentBookId = null;

// Selección de elementos del DOM
const dropArea = document.getElementById("drop-area");
const pdfPreviews = document.getElementById("pdf-previews");

// Elementos del DOM para el lector y modo oscuro
const pdfReader = document.getElementById('pdf-reader');
const closeReader = document.getElementById('close-reader');
const pageLeft = document.getElementById('page-left');
const pageRight = document.getElementById('page-right');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const darkModeToggle = document.getElementById('dark-mode-toggle');
const darkModeToggleReader = document.getElementById('dark-mode-toggle-reader');

// JSONBin.io API
let jsonBinId = localStorage.getItem('jsonBinId') || null;

// Objeto para almacenar información de los libros
let books = {};

// Función para cargar los libros desde JSONBin
async function loadBooks() {
  if (jsonBinId) {
    try {
      const response = await fetch(`https://api.jsonbin.io/v3/b/${jsonBinId}/latest`, {
        headers: {
          'X-Master-Key': JSONBIN_API_KEY,
        },
      });
      if (response.ok) {
        const data = await response.json();
        books = data.record.books || {};
        // Restaurar las vistas previas de los libros
        for (let bookId in books) {
          let bookData = books[bookId];
          createBookPreview(bookData.fileName, bookData.fileData, bookId);
        }
      }
    } catch (error) {
      console.error('Error al cargar los libros:', error);
    }
  }
}

// Llamar a loadBooks al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  await loadBooks();

  // Verificar si el modo oscuro está activado
  if (localStorage.getItem('darkMode') === 'enabled') {
    document.body.classList.add('dark-mode');
    darkModeToggle.textContent = 'Modo Claro';
    darkModeToggleReader.textContent = 'Modo Claro';
  } else {
    darkModeToggle.textContent = 'Modo Oscuro';
    darkModeToggleReader.textContent = 'Modo Oscuro';
  }
});

// Inicializar SortableJS en el contenedor de vistas previas
const sortable = new Sortable(pdfPreviews, {
  animation: 150,
  ghostClass: 'sortable-ghost',
  onEnd: function (evt) {
    // Actualizar el orden de los libros en JSONBin
    updateBooksOrder();
  },
});

// Función para actualizar el orden de los libros en JSONBin
function updateBooksOrder() {
  // Obtener todos los elementos de vista previa en su nuevo orden
  const previews = Array.from(pdfPreviews.children);
  const newBooksOrder = {};

  previews.forEach(preview => {
    const bookId = preview.getAttribute('data-book-id');
    if (books[bookId]) {
      newBooksOrder[bookId] = books[bookId];
    }
  });

  books = newBooksOrder;
  saveBooks();
}

// Función para guardar los libros en JSONBin
function saveBooks() {
  let method = 'PUT';
  let url = `https://api.jsonbin.io/v3/b/${jsonBinId}`;
  if (!jsonBinId) {
    method = 'POST';
    url = 'https://api.jsonbin.io/v3/b';
  }

  return fetch(url, {
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'X-Master-Key': JSONBIN_API_KEY,
    },
    body: JSON.stringify({ books: books }),
  })
  .then(response => response.json())
  .then(data => {
    if (!jsonBinId) {
      jsonBinId = data.metadata.id;
      localStorage.setItem('jsonBinId', jsonBinId);
    }
  })
  .catch(error => {
    console.error('Error al guardar los libros:', error);
  });
}

// Eventos para prevenir comportamientos predeterminados en el área de arrastrar y soltar
["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Estilo cuando el archivo está encima del área
['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, () => {
    dropArea.classList.remove('dragover');
  }, false);
});

// Manejar el evento de soltar archivos
dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  let dt = e.dataTransfer;
  let files = dt.files;

  handleFiles(files);
}

function handleFiles(files) {
  [...files].forEach(file => {
    if (file.type === 'application/pdf') {
      const reader = new FileReader();
      reader.onload = function(e) {
        const fileData = e.target.result;
        const fileName = file.name;
        const bookId = generateBookId(fileData, fileName);

        // Verificar si el libro ya está cargado
        if (!books[bookId]) {
          books[bookId] = {
            fileName: fileName,
            fileData: fileData,
            lastPage: 1
          };
          // Guardar los libros y luego crear la vista previa
          saveBooks()
            .then(() => {
              createBookPreview(fileName, fileData, bookId);
            })
            .catch(error => {
              console.error('Error al guardar los libros:', error);
            });
        } else {
          alert(`El libro "${fileName}" ya está cargado.`);
        }
      };
      reader.readAsDataURL(file);
    } else {
      alert('Solo se permiten archivos PDF');
    }
  });
}

function generateBookId(fileData, fileName) {
  let hash = 0;
  const str = fileName + fileData.length;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convertir a entero de 32 bits
  }
  return 'book-' + hash;
}

// Mostrar la vista previa del PDF y añadir eventos
function createBookPreview(fileName, fileData, bookId) {
  const pdfData = atob(fileData.split(',')[1]); // Decodificar Base64

  const loadingTask = pdfjsLib.getDocument({ data: pdfData });
  loadingTask.promise.then(function(pdf) {
    pdf.getPage(1).then(function(page) {
      const viewport = page.getViewport({ scale: 1 });

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport
      };
      page.render(renderContext).promise.then(function() {
        const img = document.createElement("img");
        img.src = canvas.toDataURL();

        const previewContainer = document.createElement("div");
        previewContainer.classList.add("pdf-preview");
        previewContainer.setAttribute('data-book-id', bookId); // Añadir atributo data-book-id

        previewContainer.appendChild(img);

        const title = document.createElement('p');
        title.textContent = fileName;
        previewContainer.appendChild(title);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.classList.add('delete-button');
        previewContainer.appendChild(deleteBtn);

        pdfPreviews.appendChild(previewContainer);

        // Evento para abrir el lector al hacer clic en la vista previa
        previewContainer.addEventListener('click', (e) => {
          if (e.target !== deleteBtn) {
            openPDFReader(fileData, bookId);
          }
        });

        // Evento para eliminar el libro
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // Evitar que se abra el lector
          delete books[bookId];
          saveBooks()
            .then(() => {
              pdfPreviews.removeChild(previewContainer);
            })
            .catch(error => {
              console.error('Error al eliminar el libro:', error);
            });
        });
      });
    });
  });
}

// Función para abrir el lector de PDF
function openPDFReader(fileData, bookId) {
  const pdfData = atob(fileData.split(',')[1]); // Decodificar Base64

  pdfjsLib.getDocument({ data: pdfData }).promise.then(function(pdfDoc_) {
    pdfDoc = pdfDoc_;
    totalPages = pdfDoc.numPages;
    currentPage = books[bookId].lastPage || 1;
    currentBookId = bookId;
    pdfReader.classList.remove('hidden');
    renderPages(currentPage);
    updateCanvasFilters();
  });
}

// Añadir evento de clic al botón de cerrar
closeReader.addEventListener('click', () => {
  // Guardar la página actual
  if (currentBookId) {
    books[currentBookId].lastPage = currentPage;
    saveBooks()
      .then(() => {
        pdfReader.classList.add('hidden');
        pdfDoc = null;
        currentPage = 1;
        currentBookId = null;
      })
      .catch(error => {
        console.error('Error al guardar el progreso:', error);
      });
  } else {
    pdfReader.classList.add('hidden');
    pdfDoc = null;
    currentPage = 1;
    currentBookId = null;
  }
});

// Añadir eventos a los botones de navegación
prevPageBtn.addEventListener('click', onPrevPage);
nextPageBtn.addEventListener('click', onNextPage);

function onPrevPage() {
  if (currentPage <= 1 || pageRendering) {
    return;
  }
  currentPage -= 2;
  renderPages(currentPage);
}

function onNextPage() {
  if (currentPage + 1 > totalPages || pageRendering) {
    return;
  }
  currentPage += 2;
  renderPages(currentPage);
}

// Renderizar las páginas actuales
function renderPages(num) {
  pageRendering = true;

  // Renderizar la página izquierda
  pdfDoc.getPage(num).then(function(page) {
    const viewport = page.getViewport({ scale: scale });
    const canvas = pageLeft;
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderContext = {
      canvasContext: context,
      viewport: viewport
    };

    page.render(renderContext).promise.then(function() {
      updateCanvasFilters();

      // Si hay una segunda página, renderizarla
      if (num + 1 <= totalPages) {
        pdfDoc.getPage(num + 1).then(function(page) {
          const viewport = page.getViewport({ scale: scale });
          const canvas = pageRight;
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport
          };

          page.render(renderContext).promise.then(function() {
            updateCanvasFilters();

            pageRendering = false;
            pageInfo.textContent = `Páginas ${currentPage} - ${currentPage + 1} de ${totalPages}`;
          });
        });
      } else {
        // Si no hay segunda página, limpiar el canvas derecho
        pageRight.getContext('2d').clearRect(0, 0, pageRight.width, pageRight.height);
        pageRight.style.filter = 'none';
        pageRendering = false;
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
      }
    });
  });
}

// Funciones para manejar el modo oscuro
darkModeToggle.addEventListener('click', () => {
  toggleDarkMode();
});

darkModeToggleReader.addEventListener('click', () => {
  toggleDarkMode();
});

function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  if (document.body.classList.contains('dark-mode')) {
    localStorage.setItem('darkMode', 'enabled');
    darkModeToggle.textContent = 'Modo Claro';
    darkModeToggleReader.textContent = 'Modo Claro';
  } else {
    localStorage.setItem('darkMode', 'disabled');
    darkModeToggle.textContent = 'Modo Oscuro';
    darkModeToggleReader.textContent = 'Modo Oscuro';
  }
  // Actualizar filtros de canvas
  updateCanvasFilters();
}

function updateCanvasFilters() {
  if (document.body.classList.contains('dark-mode')) {
    pageLeft.style.filter = 'invert(1) hue-rotate(180deg)';
    pageRight.style.filter = 'invert(1) hue-rotate(180deg)';
  } else {
    pageLeft.style.filter = 'none';
    pageRight.style.filter = 'none';
  }
}
