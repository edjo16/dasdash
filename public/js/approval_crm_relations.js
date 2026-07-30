// Variables para el modal de CRMs
let currentCrmPage = 1;
let totalCrmPages = 1;
let selectedCrms = new Set();
let crmsData = [];
let crmSearchDebounceTimer = null;

// Cargar relaciones de CRMs existentes
async function loadCrmRelations() {
  try {
    const approval_id = document.getElementById('ID').value;
    const response = await fetch(`/approval_get_crm_relations?approval_id=${approval_id}`);
    const data = await response.json();
    
    if (data.result === 1) {
      const container = document.getElementById('crm_relations');
      container.innerHTML = '';
      const sectionCard = container.closest('.section-card-approval');
      
      if (data.relations && data.relations.length > 0) {
        if (sectionCard) sectionCard.style.display = '';
        data.relations.forEach(rel => {
          const badge = document.createElement('div');
          badge.className = 'crm-badge';
          badge.innerHTML = `
            <a href="#" onclick="CRM_url(${rel.crm_id});" class="relation-id-link">${rel.crm_id}</a>
            - ${rel.conversacion_titulo || rel.asunto_interno || 'N/A'}
            <span class="remove-crm" onclick="removeCrmRelation(${rel.id})" title="Remove">×</span>
          `;
          container.appendChild(badge);
        });
      } else {
        container.innerHTML = '<span class="relation-empty-text">No CRMs linked yet</span>';
        if (sectionCard) sectionCard.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading CRM relations:', err);
  }
}

// Eliminar una relación de CRM
async function removeCrmRelation(relationId) {
  // if (!confirm('Are you sure you want to remove this CRM reference?')) return;
  
  try {
    const response = await fetch('/remove_crm_approval_reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relation_id: relationId })
    });
    
    const data = await response.json();
    
    if (data.result === 1) {
      launch_toast('CRM reference removed successfully', 1);
      loadCrmRelations();
    } else {
      launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
    }
  } catch (err) {
    console.error('Error removing CRM relation:', err);
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
        selectedCrms.clear();
        currentCrmPage = 1;
        document.getElementById('crm_modal').classList.add('open');
        fetchCrms();
        // Reset selector
        this.value = '';
      }
    });
  }
  
  // Cerrar modal
  const closeBtn = document.getElementById('close_crm_modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeCrmModal);
  }
  
  const cancelBtn = document.getElementById('cancel_crm_selection');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeCrmModal);
  }
  
  // Cerrar modal al hacer click fuera
  const modal = document.getElementById('crm_modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.id === 'crm_modal') {
        closeCrmModal();
      }
    });
  }
  
  // Buscar CRMs
  const searchBtn = document.getElementById('search_crm_btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      currentCrmPage = 1;
      fetchCrms();
    });
  }
  
  const searchInput = document.getElementById('search_crms');
  if (searchInput) {
    // Búsqueda al presionar Enter
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        if (crmSearchDebounceTimer) clearTimeout(crmSearchDebounceTimer);
        currentCrmPage = 1;
        fetchCrms();
      }
    });
    
    // Búsqueda automática con debounce al escribir
    searchInput.addEventListener('input', function() {
      if (crmSearchDebounceTimer) clearTimeout(crmSearchDebounceTimer);
      crmSearchDebounceTimer = setTimeout(() => {
        currentCrmPage = 1;
        fetchCrms();
      }, 500);
    });
  }
  
  // Filtro de estado para CRMs
  const statusFilter = document.getElementById('crm_status_filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      currentCrmPage = 1;
      fetchCrms();
    });
  }
  
  // Select all checkbox
  const selectAll = document.getElementById('select_all_crms');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      const isChecked = this.checked;
      const checkboxes = document.querySelectorAll('#crms_tbody input[type="checkbox"]');
      
      checkboxes.forEach((checkbox, index) => {
        const crm = crmsData[index];
        if (crm) {
          if (isChecked) {
            selectedCrms.add(crm.id);
            checkbox.closest('tr').classList.add('selected');
            checkbox.checked = true;
          } else {
            selectedCrms.delete(crm.id);
            checkbox.closest('tr').classList.remove('selected');
            checkbox.checked = false;
          }
        }
      });
      
      updateCrmSelectionCount();
    });
  }
  
  // Confirmar selección y guardar
  const confirmBtn = document.getElementById('confirm_crm_selection');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function() {
      if (selectedCrms.size === 0) {
        launch_toast('Please select at least one CRM', 2);
        return;
      }
      
      try {
        const approval_id = document.getElementById('ID').value;
        const crm_ids = Array.from(selectedCrms);
        
        const response = await fetch('/add_crm_approval_reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approval_id: parseInt(approval_id), crm_ids })
        });
        
        const data = await response.json();
        
        if (data.result === 1) {
          launch_toast(data.message || 'CRMs linked successfully', 1);
          closeCrmModal();
          loadCrmRelations();
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
  loadCrmRelations();
});

function closeCrmModal() {
  const modal = document.getElementById('crm_modal');
  if (modal) {
    modal.classList.remove('open');
    selectedCrms.clear();
  }
}

// Obtener CRMs del servidor
async function fetchCrms() {
  try {
    const searchQuery = document.getElementById('search_crms').value.trim();
    const statusFilter = document.getElementById('crm_status_filter').value;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const userName = params.get('p');
    const key = params.get('key') || '';
    const limit = 15;
    
    const assignedUsers = document.getElementById('filter_asignados_value')?.value?.trim() || '';
    const asigned = Number(document.getElementById('crm_filtro_asgined')?.value ?? 0);
    
    const requestData = {
      userid: userName,
      limit: limit,
      offset: (currentCrmPage - 1) * limit,
      page: currentCrmPage,
      search: searchQuery,
      status: statusFilter,
      key: key,
      assigned_users: assignedUsers,
      asigned: asigned
    };
    
    const response = await fetch('/crm_get_main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    const data = await response.json();
    
    if (data && data.result === 1) {
      // Obtener IDs de CRMs ya relacionados
      const approval_id = document.getElementById('ID').value;
      const relationsResponse = await fetch(`/approval_get_crm_relations?approval_id=${approval_id}`);
      const relationsData = await relationsResponse.json();
      
      const existingCrmIds = new Set();
      if (relationsData.result === 1 && relationsData.relations) {
        relationsData.relations.forEach(rel => existingCrmIds.add(rel.crm_id));
      }
      
      // Filtrar CRMs que ya están relacionados
      crmsData = (data.crm || []).filter(crm => !existingCrmIds.has(crm.id));
      renderCrmsTable(crmsData);
      renderCrmPagination(data.totalCount || 0, limit);
    }
  } catch (err) {
    console.error('Error fetching CRMs:', err);
    document.getElementById('crms_tbody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:#dc3545;">Error loading CRMs</td></tr>
    `;
  }
}

// Renderizar tabla de CRMs
function renderCrmsTable(crms) {
  const tbody = document.getElementById('crms_tbody');
  tbody.innerHTML = '';
  
  if (crms.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No CRMs found</td></tr>';
    return;
  }
  
  crms.forEach(crm => {
    const isSelected = selectedCrms.has(crm.id);
    const row = document.createElement('tr');
    row.className = isSelected ? 'selected' : '';
    row.onclick = () => toggleCrmSelection(crm.id, row);
    
    let statusHtml = '';
    if (crm.xestado) {
      const statusColor = crm.xestado.toLowerCase().includes('close') ? '#00586f' : '#ffc107';
      statusHtml = `<span style="color:white;background:${statusColor};padding:2px 8px;border-radius:10px;font-size:0.85rem;">${crm.xestado}</span>`;
    } else {
      statusHtml = '<span style="color:#6c757d;">N/A</span>';
    }
    
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleCrmSelection(${crm.id}, this.closest('tr'));">
      </td>
      <td><strong>${crm.id}</strong></td>
      <td>${crm.conversacion_titulo || crm.asunto_interno || 'N/A'}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${crm.de_nombre || ''}">${crm.de_nombre || 'N/A'}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${statusHtml}</td>
    `;
    tbody.appendChild(row);
  });
}

// Toggle selección de CRM
function toggleCrmSelection(crmId, row) {
  if (selectedCrms.has(crmId)) {
    selectedCrms.delete(crmId);
    row.classList.remove('selected');
    row.querySelector('input[type="checkbox"]').checked = false;
  } else {
    selectedCrms.add(crmId);
    row.classList.add('selected');
    row.querySelector('input[type="checkbox"]').checked = true;
  }
  updateCrmSelectionCount();
}

// Actualizar contador de seleccionados
function updateCrmSelectionCount() {
  const countDiv = document.getElementById('crm_count');
  if (countDiv) {
    countDiv.textContent = `${selectedCrms.size} CRM(s) selected`;
  }
}

// Renderizar paginación
function renderCrmPagination(totalCount, limit) {
  totalCrmPages = Math.ceil(totalCount / limit);
  const container = document.getElementById('crm_pagination_controls');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Botón anterior
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentCrmPage === 1;
  prevBtn.onclick = () => {
    if (currentCrmPage > 1) {
      currentCrmPage--;
      fetchCrms();
    }
  };
  container.appendChild(prevBtn);
  
  // Números de página
  const startPage = Math.max(1, currentCrmPage - 2);
  const endPage = Math.min(totalCrmPages, currentCrmPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentCrmPage ? 'active' : '';
    pageBtn.onclick = () => {
      currentCrmPage = i;
      fetchCrms();
    };
    container.appendChild(pageBtn);
  }
  
  // Botón siguiente
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentCrmPage === totalCrmPages;
  nextBtn.onclick = () => {
    if (currentCrmPage < totalCrmPages) {
      currentCrmPage++;
      fetchCrms();
    }
  };
  container.appendChild(nextBtn);
  
  updateCrmSelectionCount();
}
