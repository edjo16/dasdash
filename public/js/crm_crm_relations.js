// Variables para el modal de CRMs relacionados
let currentCrmCrmPage = 1;
let totalCrmCrmPages = 1;
let selectedRelatedCrms = new Set();
let relatedCrmsData = [];
let crmSearchDebounceTimer = null;

// Cargar relaciones de CRMs existentes
async function loadCrmCrmRelations() {
  try {
    const crm_id = document.getElementById('crm_id').value;
    const response = await fetch(`/crm_get_crm_relations?crm_id=${crm_id}`);
    const data = await response.json();
    
    if (data.result === 1) {
      const container = document.getElementById('crm_crm_relations');
      container.innerHTML = '';
      const sectionCard = container.closest('.section-card');

      if (data.relations && data.relations.length > 0) {
        if (sectionCard) sectionCard.style.display = '';
        data.relations.forEach(rel => {
          const badge = document.createElement('div');
          badge.className = 'approval-badge';
          badge.innerHTML = `
            <a href="#" onclick="CRM_url(${rel.related_crm_id_resolved});" class="relation-id-link">
              ${rel.related_crm_id_resolved}
            </a>
            - ${rel.conversacion_titulo.slice(0, 100)  || 'N/A'}
            <span class="remove-approval" onclick="removeCrmCrmRelation(${rel.id})" title="Remove">×</span>
          `;
          container.appendChild(badge);
        });
      } else {
        container.innerHTML = '<span class="relation-empty-text">No CRMs linked yet</span>';
        if (sectionCard) sectionCard.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading CRM-CRM relations:', err);
  }
}

// Eliminar una relación de CRM
async function removeCrmCrmRelation(relationId) {
  // if (!confirm('Are you sure you want to remove this CRM reference?')) return;
  
  try {
    const response = await fetch('/remove_crm_crm_reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relation_id: relationId })
    });
    
    const data = await response.json();
    
    if (data.result === 1) {
      launch_toast('CRM reference removed successfully', 1);
      loadCrmCrmRelations();
    } else {
      launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
    }
  } catch (err) {
    console.error('Error removing CRM-CRM relation:', err);
    launch_toast('Error removing CRM reference', 2);
  }
}

// Abrir modal de selección de CRMs
document.addEventListener('DOMContentLoaded', function() {
  const typeSelector = document.querySelector('.reference-type-selector');
  
  if (typeSelector) {
    typeSelector.addEventListener('change', function() {
      const selectedType = this.value;
      if (selectedType === 'crm') {
        selectedRelatedCrms.clear();
        currentCrmCrmPage = 1;
        document.getElementById('crm_crm_modal').classList.add('active');
        fetchRelatedCrms();
        // Reset selector
        this.value = 'crm';
      }
    });
  }
  
  // Cerrar modal
  const closeBtn = document.getElementById('close_crm_crm_modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeCrmCrmModal);
  }
  
  const cancelBtn = document.getElementById('cancel_crm_crm_selection');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeCrmCrmModal);
  }
  
  // Cerrar modal al hacer click fuera
  const modal = document.getElementById('crm_crm_modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.id === 'crm_crm_modal') {
        closeCrmCrmModal();
      }
    });
  }
  
  // Búsqueda automática con debounce
  const searchInput = document.getElementById('search_crms_related');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      clearTimeout(crmSearchDebounceTimer);
      crmSearchDebounceTimer = setTimeout(() => {
        currentCrmCrmPage = 1;
        fetchRelatedCrms();
      }, 500);
    });
    
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        clearTimeout(crmSearchDebounceTimer);
        currentCrmCrmPage = 1;
        fetchRelatedCrms();
      }
    });
  }
  
  // Filtro automático al cambiar status
  const statusFilter = document.getElementById('crm_crm_status_filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      currentCrmCrmPage = 1;
      fetchRelatedCrms();
    });
  }
  
  // Select all checkbox
  const selectAll = document.getElementById('select_all_crms_related');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      const isChecked = this.checked;
      const checkboxes = document.querySelectorAll('#crms_related_tbody input[type="checkbox"]');
      
      checkboxes.forEach((checkbox, index) => {
        const crm = relatedCrmsData[index];
        if (crm) {
          if (isChecked) {
            selectedRelatedCrms.add(crm.id);
            checkbox.closest('tr').classList.add('selected');
            checkbox.checked = true;
          } else {
            selectedRelatedCrms.delete(crm.id);
            checkbox.closest('tr').classList.remove('selected');
            checkbox.checked = false;
          }
        }
      });
      
      updateCrmCrmSelectionCount();
    });
  }
  
  // Confirmar selección y guardar
  const confirmBtn = document.getElementById('confirm_crm_crm_selection');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function() {
      if (selectedRelatedCrms.size === 0) {
        launch_toast('Please select at least one CRM', 2);
        return;
      }
      
      try {
        const crm_id = document.getElementById('crm_id').value;
        const related_crm_ids = Array.from(selectedRelatedCrms);
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        const userName = params.get('p');
        
        const response = await fetch('/add_crm_crm_reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            crm_id: parseInt(crm_id), 
            related_crm_ids,
            created_by: userName
          })
        });
        
        const data = await response.json();
        
        if (data.result === 1) {
          launch_toast(data.message || 'CRMs linked successfully', 1);
          closeCrmCrmModal();
          loadCrmCrmRelations();
        } else {
          launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
        }
      } catch (err) {
        console.error('Error saving CRM references:', err);
        launch_toast('Error saving CRM references', 2);
      }
    });
  }
  
  // Cargar relaciones al inicio
  loadCrmCrmRelations();
});

function closeCrmCrmModal() {
  const modal = document.getElementById('crm_crm_modal');
  if (modal) {
    modal.classList.remove('active');
    selectedRelatedCrms.clear();
  }
}

// Obtener CRMs del servidor
async function fetchRelatedCrms() {
  try {
    const searchQuery = document.getElementById('search_crms_related').value.trim();
    const statusFilter = document.getElementById('crm_crm_status_filter').value;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const userName = params.get('p');
    const currentCrmId = document.getElementById('crm_id').value;
    const limit = 15;
    
    const requestData = {
      userid: userName,
      limit: limit,
      offset: (currentCrmCrmPage - 1) * limit,
      search: searchQuery,
      status: statusFilter,
      key: statusFilter
    };
    
    const response = await fetch('/crm_get_main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    const data = await response.json();
    
    if (data && data.result === 1) {
      // Obtener IDs de CRMs ya relacionados
      const relationsResponse = await fetch(`/crm_get_crm_relations?crm_id=${currentCrmId}`);
      const relationsData = await relationsResponse.json();
      
      const existingCrmIds = new Set([parseInt(currentCrmId)]); // Incluir el CRM actual
      if (relationsData.result === 1 && relationsData.relations) {
        relationsData.relations.forEach(rel => existingCrmIds.add(rel.related_crm_id_resolved));
      }
      
      // Filtrar CRMs que ya están relacionados o es el mismo CRM
      relatedCrmsData = (data.crm || []).filter(crm => !existingCrmIds.has(crm.id));
      renderCrmsRelatedTable(relatedCrmsData);
      renderCrmCrmPagination(data.totalCount || 0, limit);
    }
  } catch (err) {
    console.error('Error fetching CRMs:', err);
    document.getElementById('crms_related_tbody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:#dc3545;">Error loading CRMs</td></tr>
    `;
  }
}

// Renderizar tabla de CRMs
function renderCrmsRelatedTable(crms) {
  const tbody = document.getElementById('crms_related_tbody');
  tbody.innerHTML = '';
  
  if (crms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No CRMs found</td></tr>';
    return;
  }
  
  crms.forEach(crm => {
    const isSelected = selectedRelatedCrms.has(crm.id);
    const row = document.createElement('tr');
    row.className = isSelected ? 'selected' : '';
    row.onclick = () => toggleCrmCrmSelection(crm.id, row);
    
    let statusHtml = '';
    if (crm.xestado) {
      const statusColor = crm.xestado.toLowerCase().includes('close') ? '#00586f' : '#ffc107';
      statusHtml = `<span style="color:white;background:${statusColor};padding:2px 8px;border-radius:10px;font-size:0.85rem;">${crm.xestado}</span>`;
    } else {
      statusHtml = '<span style="color:#6c757d;">N/A</span>';
    }
    
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleCrmCrmSelection(${crm.id}, this.closest('tr'));">
      </td>
      <td><strong>${crm.id}</strong></td>
      <td>${crm.conversacion_titulo || crm.asunto_interno || 'N/A'}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${statusHtml}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${crm.de_nombre || ''}">${crm.de_nombre || 'N/A'}</td>
    `;
    tbody.appendChild(row);
  });
}

// Toggle selección de CRM
function toggleCrmCrmSelection(crmId, row) {
  if (selectedRelatedCrms.has(crmId)) {
    selectedRelatedCrms.delete(crmId);
    row.classList.remove('selected');
    row.querySelector('input[type="checkbox"]').checked = false;
  } else {
    selectedRelatedCrms.add(crmId);
    row.classList.add('selected');
    row.querySelector('input[type="checkbox"]').checked = true;
  }
  updateCrmCrmSelectionCount();
}

// Actualizar contador de seleccionados
function updateCrmCrmSelectionCount() {
  const countDiv = document.getElementById('crm_crm_count');
  if (countDiv) {
    countDiv.textContent = `${selectedRelatedCrms.size} CRM(s) selected`;
  }
}

// Renderizar paginación
function renderCrmCrmPagination(totalCount, limit) {
  totalCrmCrmPages = Math.ceil(totalCount / limit);
  const container = document.getElementById('crm_crm_pagination_controls');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Botón anterior
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentCrmCrmPage === 1;
  prevBtn.onclick = () => {
    if (currentCrmCrmPage > 1) {
      currentCrmCrmPage--;
      fetchRelatedCrms();
    }
  };
  container.appendChild(prevBtn);
  
  // Números de página
  const startPage = Math.max(1, currentCrmCrmPage - 2);
  const endPage = Math.min(totalCrmCrmPages, currentCrmCrmPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentCrmCrmPage ? 'active' : '';
    pageBtn.onclick = () => {
      currentCrmCrmPage = i;
      fetchRelatedCrms();
    };
    container.appendChild(pageBtn);
  }
  
  // Botón siguiente
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentCrmCrmPage === totalCrmCrmPages;
  nextBtn.onclick = () => {
    if (currentCrmCrmPage < totalCrmCrmPages) {
      currentCrmCrmPage++;
      fetchRelatedCrms();
    }
  };
  container.appendChild(nextBtn);
  
  updateCrmCrmSelectionCount();
}
