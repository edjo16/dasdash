// Variables para el modal de Approvals relacionados
let currentApprovalPage = 1;
let totalApprovalPages = 1;
let selectedApprovals = new Set();
let approvalsData = [];
let searchDebounceTimer = null;

// Cargar relaciones de Approvals existentes
async function loadApprovalRelations() {
  try {
    const approval_id = document.getElementById('ID').value;
    const response = await fetch(`/approval_get_approval_relations?approval_id=${approval_id}`);
    const data = await response.json();
    
    if (data.result === 1) {
      const container = document.getElementById('approval_relations');
      container.innerHTML = '';
      const sectionCard = container.closest('.section-card-approval');
      
      if (data.relations && data.relations.length > 0) {
        if (sectionCard) sectionCard.style.display = '';
        data.relations.forEach(rel => {
          const badge = document.createElement('div');
          badge.className = 'approval-badge';
          badge.innerHTML = `
            <a href="#" onclick="approval_detalle(${rel.related_approval_id});" class="relation-id-link">
              #${rel.related_approval_id}
            </a>
            - ${(rel.detalle_proceso || 'N/A').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}: ${(rel.detalle_proceso || 'N/A').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}
            <span class="remove-approval" onclick="removeApprovalRelation(${rel.id})" title="Remove">×</span>
          `;
          container.appendChild(badge);
        });
      } else {
        container.innerHTML = '<span class="relation-empty-text">No approvals linked yet</span>';
        if (sectionCard) sectionCard.style.display = 'none';
      }
    }
  } catch (err) {
    console.error('Error loading approval relations:', err);
  }
}

// Eliminar una relación de Approval
async function removeApprovalRelation(relationId) {
  // if (!confirm('Are you sure you want to remove this approval reference?')) return;
  
  try {
    const response = await fetch('/remove_approval_approval_reference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relation_id: relationId })
    });
    
    const data = await response.json();
    
    if (data.result === 1) {
      launch_toast('Approval reference removed successfully', 1);
      loadApprovalRelations();
    } else {
      launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
    }
  } catch (err) {
    console.error('Error removing approval relation:', err);
    launch_toast('Error removing approval reference', 2);
  }
}

// Abrir modal de selección de Approvals
document.addEventListener('DOMContentLoaded', function() {
  const typeSelector = document.querySelector('.reference-type-selector');
  
  if (typeSelector) {
    typeSelector.addEventListener('change', function() {
      const selectedType = this.value;
      if (selectedType === 'approval') {
        selectedApprovals.clear();
        currentApprovalPage = 1;
        document.getElementById('approval_approval_modal').classList.add('open');
        fetchRelatedApprovals();
        // Reset selector
        this.value = '';
      }
    });
  }
  
  // Cerrar modal
  const closeBtn = document.getElementById('close_approval_approval_modal');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeApprovalApprovalModal);
  }
  
  const cancelBtn = document.getElementById('cancel_approval_selection');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', closeApprovalApprovalModal);
  }
  
  // Cerrar modal al hacer click fuera
  const modal = document.getElementById('approval_approval_modal');
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target.id === 'approval_approval_modal') {
        closeApprovalApprovalModal();
      }
    });
  }
  
  // Buscar Approvals
  const searchBtn = document.getElementById('search_approval_btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      currentApprovalPage = 1;
      fetchRelatedApprovals();
    });
  }
  
  const searchInput = document.getElementById('search_approvals_related');
  if (searchInput) {
    // Búsqueda al presionar Enter
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        currentApprovalPage = 1;
        fetchRelatedApprovals();
      }
    });
    
    // Búsqueda automática con debounce al escribir
    searchInput.addEventListener('input', function() {
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        currentApprovalPage = 1;
        fetchRelatedApprovals();
      }, 500);
    });
  }
  
  // Filtro de estado
  const statusFilter = document.getElementById('approval_status_filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      currentApprovalPage = 1;
      fetchRelatedApprovals();
    });
  }
  
  // Select all checkbox
  const selectAll = document.getElementById('select_all_approvals');
  if (selectAll) {
    selectAll.addEventListener('change', function() {
      const isChecked = this.checked;
      const checkboxes = document.querySelectorAll('#approvals_related_tbody input[type="checkbox"]');
      
      checkboxes.forEach((checkbox, index) => {
        const approval = approvalsData[index];
        if (approval) {
          if (isChecked) {
            selectedApprovals.add(approval.RowID);
            checkbox.closest('tr').classList.add('selected');
            checkbox.checked = true;
          } else {
            selectedApprovals.delete(approval.RowID);
            checkbox.closest('tr').classList.remove('selected');
            checkbox.checked = false;
          }
        }
      });
      
      updateApprovalSelectionCount();
    });
  }
  
  // Confirmar selección y guardar
  const confirmBtn = document.getElementById('confirm_approval_selection');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async function() {
      if (selectedApprovals.size === 0) {
        launch_toast('Please select at least one approval', 2);
        return;
      }
      
      try {
        const approval_id = document.getElementById('ID').value;
        const related_approval_ids = Array.from(selectedApprovals);
        const url = new URL(window.location.href);
        const params = new URLSearchParams(url.search);
        const userName = params.get('p');
        
        const response = await fetch('/add_approval_approval_reference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            approval_id: parseInt(approval_id), 
            related_approval_ids,
            created_by: userName
          })
        });
        
        const data = await response.json();
        
        if (data.result === 1) {
          launch_toast(data.message || 'Approvals linked successfully', 1);
          closeApprovalApprovalModal();
          loadApprovalRelations();
        } else {
          launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
        }
      } catch (err) {
        console.error('Error saving approval references:', err);
        launch_toast('Error saving approval references', 2);
      }
    });
  }
  
  // Cargar relaciones al inicio
  loadApprovalRelations();
});

function closeApprovalApprovalModal() {
  const modal = document.getElementById('approval_approval_modal');
  if (modal) {
    modal.classList.remove('open');
    selectedApprovals.clear();
  }
}

// Obtener Approvals del servidor
async function fetchRelatedApprovals() {
  try {
    const searchQuery = document.getElementById('search_approvals_related').value.trim();
    const statusFilter = document.getElementById('approval_status_filter').value;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const userName = params.get('p');
    const currentApprovalId = document.getElementById('ID').value;
    const limit = 15;
    
    const requestData = {
      p: userName,
      page: currentApprovalPage,
      limit: limit,
      status: statusFilter,
      search: searchQuery,
      process: '',
      type: '',
      only_start: false
    };
    
    const fullUrl = new URL('/all-approvals', window.location.origin);
    Object.keys(requestData).forEach(key => {
      if (requestData[key] !== '' && requestData[key] !== false) {
        fullUrl.searchParams.append(key, requestData[key]);
      }
    });
    
    const response = await fetch(fullUrl);
    const data = await response.json();
    
    if (data && data.approvalData) {
      // Obtener IDs de approvals ya relacionados
      const relationsResponse = await fetch(`/approval_get_approval_relations?approval_id=${currentApprovalId}`);
      const relationsData = await relationsResponse.json();
      
      const existingApprovalIds = new Set([parseInt(currentApprovalId)]); // Incluir el approval actual
      if (relationsData.result === 1 && relationsData.relations) {
        relationsData.relations.forEach(rel => existingApprovalIds.add(rel.related_approval_id));
      }
      
      // Filtrar approvals que ya están relacionados o es el mismo approval
      approvalsData = data.approvalData.filter(approval => !existingApprovalIds.has(approval.id || approval.RowID));
      renderApprovalsRelatedTable(approvalsData);
      renderApprovalPagination(data.totalCount || 0, limit);
    }
  } catch (err) {
    console.error('Error fetching approvals:', err);
    document.getElementById('approvals_related_tbody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:#dc3545;">Error loading approvals</td></tr>
    `;
  }
}

// Renderizar tabla de Approvals
function renderApprovalsRelatedTable(approvals) {
  const tbody = document.getElementById('approvals_related_tbody');
  tbody.innerHTML = '';
  
  if (approvals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No approvals found</td></tr>';
    return;
  }
  
  approvals.forEach(approval => {
    const isSelected = selectedApprovals.has(approval.id || approval.RowID);
    const row = document.createElement('tr');
    row.className = isSelected ? 'selected' : '';
    const approvalId = approval.id || approval.RowID;
    row.onclick = () => toggleApprovalSelection(approvalId, row);
    
    let statusHtml = '';
    if (approval.estado === 'Approved' || approval.estado === 'Executed' || approval.estado === 'Applied' || approval.estado === 'Signed') {
      statusHtml = '<span style="color:white;background:#00586f;padding:2px 8px;border-radius:10px;font-size:0.85rem;">Closed</span>';
    } else if (approval.estado === 'Rejected') {
      statusHtml = '<span style="color:white;background:#6c757d;padding:2px 8px;border-radius:10px;font-size:0.85rem;">Rejected</span>';
    } else {
      statusHtml = '<span style="color:white;background:#ffc107;padding:2px 8px;border-radius:10px;font-size:0.85rem;">Ongoing</span>';
    }
    
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleApprovalSelection(${approvalId}, this.closest('tr'));">
      </td>
      <td><strong>${approvalId}</strong></td>
      <td>${approval.proceso || 'N/A'}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(approval.detalle_proceso || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}">${(approval.detalle_proceso || 'N/A').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${statusHtml}</td>
    `;
    tbody.appendChild(row);
  });
}

// Toggle selección de Approval
function toggleApprovalSelection(approvalId, row) {
  if (selectedApprovals.has(approvalId)) {
    selectedApprovals.delete(approvalId);
    row.classList.remove('selected');
    row.querySelector('input[type="checkbox"]').checked = false;
  } else {
    selectedApprovals.add(approvalId);
    row.classList.add('selected');
    row.querySelector('input[type="checkbox"]').checked = true;
  }
  updateApprovalSelectionCount();
}

// Actualizar contador de seleccionados
function updateApprovalSelectionCount() {
  const countDiv = document.getElementById('approval_related_count');
  if (countDiv) {
    countDiv.textContent = `${selectedApprovals.size} Approval(s) selected`;
  }
}

// Renderizar paginación
function renderApprovalPagination(totalCount, limit) {
  totalApprovalPages = Math.ceil(totalCount / limit);
  const container = document.getElementById('approval_pagination_controls');
  if (!container) return;
  
  container.innerHTML = '';
  
  // Botón anterior
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentApprovalPage === 1;
  prevBtn.onclick = () => {
    if (currentApprovalPage > 1) {
      currentApprovalPage--;
      fetchRelatedApprovals();
    }
  };
  container.appendChild(prevBtn);
  
  // Números de página
  const startPage = Math.max(1, currentApprovalPage - 2);
  const endPage = Math.min(totalApprovalPages, currentApprovalPage + 2);
  
  for (let i = startPage; i <= endPage; i++) {
    const pageBtn = document.createElement('button');
    pageBtn.textContent = i;
    pageBtn.className = i === currentApprovalPage ? 'active' : '';
    pageBtn.onclick = () => {
      currentApprovalPage = i;
      fetchRelatedApprovals();
    };
    container.appendChild(pageBtn);
  }
  
  // Botón siguiente
  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = currentApprovalPage === totalApprovalPages;
  nextBtn.onclick = () => {
    if (currentApprovalPage < totalApprovalPages) {
      currentApprovalPage++;
      fetchRelatedApprovals();
    }
  };
  container.appendChild(nextBtn);
  
  updateApprovalSelectionCount();
}
