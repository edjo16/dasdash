// Variables para el modal de approvals
let currentApprovalPage = 1;
let totalApprovalPages = 1;
let selectedApprovals = new Set();
let approvalsData = [];
let approvalSearchDebounceTimer = null;

// Cargar relaciones de approvals existentes
async function loadApprovalRelations() {
  try {
    const crm_id = document.getElementById('crm_id').value;
    const response = await fetch(`/crm_get_approval_relations?crm_id=${crm_id}`);
    const data = await response.json();
    
    if (data.result === 1) {
      const container = document.getElementById('approval_relations');
      container.innerHTML = '';
      const sectionCard = container.closest('.section-card');

      if (data.relations && data.relations.length > 0) {
        if (sectionCard) sectionCard.style.display = '';
        data.relations.forEach(rel => {
          const badge = document.createElement('div');
          badge.className = 'approval-badge';
          badge.innerHTML = `
            <a href="#" onclick="approval_detalle(${rel.approval_id});" class="relation-id-link">${rel.approval_id}</a> - ${rel.proceso}
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

// Eliminar una relación de approval
async function removeApprovalRelation(relationId) {
  // if (!confirm('Are you sure you want to remove this approval reference?')) return;
  
  try {
    const response = await fetch('/remove_approval_crm_reference', {
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

// Abrir modal de selección de approvals
document.addEventListener('DOMContentLoaded', function() {
  const typeSelector = document.querySelector('.reference-type-selector');
  
  if (typeSelector) {
    typeSelector.addEventListener('change', function() {
      const selectedType = this.value;
      if (selectedType === 'approval') {
        selectedApprovals.clear();
        currentApprovalPage = 1;
        document.getElementById('approval_modal').classList.add('active');
        fetchApprovals();
        // Reset selector
        this.value = 'approval';
      }
    });
  }
  
  // Cerrar modal
  document.getElementById('close_approval_modal').addEventListener('click', closeApprovalModal);
  document.getElementById('cancel_selection').addEventListener('click', closeApprovalModal);
  
  // Cerrar modal al hacer click fuera
  document.getElementById('approval_modal').addEventListener('click', function(e) {
    if (e.target.id === 'approval_modal') {
      closeApprovalModal();
    }
  });
  
  // Búsqueda automática con debounce
  const searchInput = document.getElementById('search_approvals');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      clearTimeout(approvalSearchDebounceTimer);
      approvalSearchDebounceTimer = setTimeout(() => {
        currentApprovalPage = 1;
        fetchApprovals();
      }, 500);
    });
    
    searchInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        clearTimeout(approvalSearchDebounceTimer);
        currentApprovalPage = 1;
        fetchApprovals();
      }
    });
  }
  
  // Filtro automático al cambiar status
  const statusFilter = document.getElementById('status_filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', function() {
      currentApprovalPage = 1;
      fetchApprovals();
    });
  }
  
  // Select all checkbox
  document.getElementById('select_all').addEventListener('change', function() {
    const isChecked = this.checked;
    const checkboxes = document.querySelectorAll('#approvals_tbody input[type="checkbox"]');
    
    checkboxes.forEach((checkbox, index) => {
      const approval = approvalsData[index];
      if (approval) {
        if (isChecked) {
          selectedApprovals.add(approval.id);
          checkbox.closest('tr').classList.add('selected');
          checkbox.checked = true;
        } else {
          selectedApprovals.delete(approval.id);
          checkbox.closest('tr').classList.remove('selected');
          checkbox.checked = false;
        }
      }
    });
    
    updateSelectionCount();
  });
  
  // Confirmar selección y guardar
  document.getElementById('confirm_selection').addEventListener('click', async function() {
    if (selectedApprovals.size === 0) {
      launch_toast('Please select at least one approval', 2);
      return;
    }
    
    try {
      const crm_id = document.getElementById('crm_id').value;
      const approval_ids = Array.from(selectedApprovals);
      
      const response = await fetch('/add_approval_crm_reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crm_id: parseInt(crm_id), approval_ids })
      });
      
      const data = await response.json();
      
      if (data.result === 1) {
        launch_toast(data.message || 'Approvals linked successfully', 1);
        closeApprovalModal();
        loadApprovalRelations();
      } else {
        launch_toast('Error: ' + (data.err || 'Unknown error'), 2);
      }
    } catch (err) {
      console.error('Error saving approval references:', err);
      launch_toast('Error saving approval references', 2);
    }
  });
  
  // Cargar relaciones al inicio
  loadApprovalRelations();
});

function closeApprovalModal() {
  document.getElementById('approval_modal').classList.remove('active');
  selectedApprovals.clear();
}

// Obtener approvals del servidor
async function fetchApprovals() {
  try {
    const searchQuery = document.getElementById('search_approvals').value.trim();
    const statusFilter = document.getElementById('status_filter').value;
    const url = new URL(window.location.href);
    const params = new URLSearchParams(url.search);
    const limit = 15
    
    let request = `/all-approvals?page=${currentApprovalPage}&limit=${limit}&status=${statusFilter}`;
    
    if (searchQuery !== '') {
      request += `&search=${encodeURIComponent(searchQuery)}`;
    }
    
    const response = await fetch(request);
    const data = await response.json();
    
    if (data.approvalData) {
      // Obtener IDs de approvals ya relacionados
      const crm_id = document.getElementById('crm_id').value;
      const relationsResponse = await fetch(`/crm_get_approval_relations?crm_id=${crm_id}`);
      const relationsData = await relationsResponse.json();
      
      const existingApprovalIds = new Set();
      if (relationsData.result === 1 && relationsData.relations) {
        relationsData.relations.forEach(rel => existingApprovalIds.add(rel.approval_id));
      }
      
      // Filtrar approvals que ya están relacionados
      approvalsData = data.approvalData.filter(approval => !existingApprovalIds.has(approval.id));
      renderApprovalsTable(approvalsData);
      renderApprovalPagination(data.totalCount, limit);
    }
  } catch (err) {
    console.error('Error fetching approvals:', err);
    document.getElementById('approvals_tbody').innerHTML = `
      <tr><td colspan="5" style="text-align:center;color:#dc3545;">Error loading approvals</td></tr>
    `;
  }
}

// Renderizar tabla de approvals
function renderApprovalsTable(approvals) {
  const tbody = document.getElementById('approvals_tbody');
  tbody.innerHTML = '';
  
  if (approvals.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No approvals found</td></tr>';
    return;
  }
  
  approvals.forEach(approval => {
    const isSelected = selectedApprovals.has(approval.id);
    const row = document.createElement('tr');
    row.className = isSelected ? 'selected' : '';
    row.onclick = () => toggleApprovalSelection(approval.id, row);
    
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
        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); toggleApprovalSelection(${approval.id}, this.closest('tr'));">
      </td>
      <td><strong>#${approval.id}</strong></td>
      <td>${approval.proceso || 'N/A'}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(approval.detalle_proceso || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}">${(approval.detalle_proceso || 'N/A').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()}</td>
      <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${statusHtml}</td>
    `;
    tbody.appendChild(row);
  });
}

// Toggle selección de approval
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
  updateSelectionCount();
}

// Actualizar contador de seleccionados
function updateSelectionCount() {
  const countDiv = document.getElementById('approval_count');
  countDiv.textContent = `${selectedApprovals.size} approval(s) selected`;
}

// Renderizar paginación
function renderApprovalPagination(totalCount, limit) {
  totalApprovalPages = Math.ceil(totalCount / limit);
  const container = document.getElementById('pagination_controls');
  container.innerHTML = '';
  
  // Botón anterior
  const prevBtn = document.createElement('button');
  prevBtn.textContent = '← Prev';
  prevBtn.disabled = currentApprovalPage === 1;
  prevBtn.onclick = () => {
    if (currentApprovalPage > 1) {
      currentApprovalPage--;
      fetchApprovals();
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
      fetchApprovals();
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
      fetchApprovals();
    }
  };
  container.appendChild(nextBtn);
  
  updateSelectionCount();
}
