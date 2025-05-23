document.addEventListener('DOMContentLoaded', function () {
  const searchIcon = document.getElementById('searchIcon');
  const searchForm = document.getElementById('searchForm');

  if (searchIcon && searchForm) {
    searchIcon.addEventListener('click', function () {
      searchForm.submit();
    });
  }

  const searchArea = document.getElementById('searchArea');
  const resultados = document.querySelector('.resultados');
  const temResultados = resultados && resultados.children.length > 0;

  if (temResultados) {
    searchArea.classList.add('top');
  }
});

function abrirModalFiltro() {
    document.getElementById("modal-filtro").style.display = "flex";
  }

  function fecharModalFiltro(event) {
    const modal = document.getElementById("modal-filtro");
    if (!event || event.target === modal) {
      modal.style.display = "none";
    }
  }