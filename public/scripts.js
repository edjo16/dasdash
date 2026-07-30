/*!
 * Start Bootstrap - SB Admin v7.0.2 (https://startbootstrap.com/template/sb-admin)
 * Copyright 2013-2021 Start Bootstrap
 * Licensed under MIT (https://github.com/StartBootstrap/startbootstrap-sb-admin/blob/master/LICENSE)
 */
// 
// Declaraciones
// 
const actores = ["solicitante", "verificador", "aprobador", "firmante", "operador", "ejecutor"]
const acciones = ["Requested", "Verify", "Approve", "Signature", "Apply", "Execute"]
const acciones_reealizadas = ["Requested", "Verified", "Approved", "Signed", "Applied", "Executed"]

//Params
const queryString = window.location.search;
const urlParams = new URLSearchParams(queryString);
// 
// Functions
// 
function popup_close(popup) {
    a = typeof popup
    if (a == "string") {
        document.getElementById(popup).classList.toggle("show-popup")
    } else {
        popup.firstChild.classList.toggle("show-popup")
    }
};

function ShowHideDiv(divName) {
    document.getElementById(divName).classList.toggle("Not")
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function nFormatter(num, digits) {
    const lookup = [
        { value: 1, symbol: "" },
        { value: 1e3, symbol: "k" },
        { value: 1e6, symbol: "M" },
        { value: 1e9, symbol: "G" },
        { value: 1e12, symbol: "T" },
        { value: 1e15, symbol: "P" },
        { value: 1e18, symbol: "E" }
    ];
    const rx = /\.0+$|(\.[0-9]*[1-9])0+$/;
    var item = lookup.slice().reverse().find(function (item) {
        return num >= item.value;
    });
    return item ? (num / item.value).toFixed(digits).replace(rx, "$1") + item.symbol : "0";
}
window.addEventListener('DOMContentLoaded', event => {

    // Toggle the side navigation
    const sidebarToggle = document.body.querySelector('#sidebarToggle');
    if (sidebarToggle) {
        // Uncomment Below to persist sidebar toggle between refreshes
        // if (localStorage.getItem('sb|sidebar-toggle') === 'true') {
        //     document.body.classList.toggle('sb-sidenav-toggled');
        // }
        sidebarToggle.addEventListener('click', event => {
            event.preventDefault();
            document.body.classList.toggle('sb-sidenav-toggled');
            localStorage.setItem('sb|sidebar-toggle', document.body.classList.contains('sb-sidenav-toggled'));
        });
    }

});
function SearchTableMessages() {
    var input = document.getElementById("SearchBox");
    var filter = input.value.toUpperCase(); 
    var table = document.getElementById("MainTable");
    var tr = table.getElementsByTagName("tr");
    var e = 0;

    for (var i = 0; i < tr.length; i++) {
        var find = false;

        if (tr[i].id !== 'header') {
            var td = tr[i].getElementsByTagName("td");

            for (var a = 0; a < td.length; a++) {
                var txtValue = td[a].textContent || td[a].innerText;

                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    find = true;
                    break; 
                }
            }

            if (find) {
                if (e % 2 == 0) {
                    tr[i].style.backgroundColor = "#fff";
                } else {
                    tr[i].style.backgroundColor = "#e5e5e5";
                }
                tr[i].style.display = "";
                e++;
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}
function url_usuario(id) {
    var url_string = window.location.href;
    var url = new URL(url_string);
    const params = new URLSearchParams(url.search);
    let key = params.get('key')
    if (key) {
        params.delete('key');
    }
    
    if (id == "home") {
        newurl = params.toString().replace(new RegExp(/&RowID=\d{1,10}/, "g"), "");
        newurl = newurl.replace('&result=1', '');
        newurl = newurl.replace('#', '');
        newurl = newurl.replace("Toast", "")
        newurl = newurl.replace("ToastMessaje", "")
        window.location.href = "/?" + newurl;
    } else {
        newurl = params.toString().replace(new RegExp(/&RowID=\d{1,10}/, "g"), "");
        newurl = newurl.replace('&result=1', '');
        newurl = newurl.replace('#', '');
        window.location.href = "/" + id + "?" + newurl;
    }
}

function ApprovalCreate(id) {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    url_string = url_string.replace("Toast", "")
    url_string = url_string.replace("ToastMessaje", "")
    var url = new URL(url_string);
    window.location.href = "/forms_interdepartmental_request?" + url.searchParams + "&RowID=" + id;
};
function ApprovalCreatePayment(id) {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    url_string = url_string.replace("Toast", "")
    url_string = url_string.replace("ToastMessaje", "")
    var url = new URL(url_string);
    window.location.href = "/forms_interdepartmental_request?" + url.searchParams + "&RowID=" + id + "&version=2";
};
function ocultartd(id) {
    var trparent = id.parentElement.parentElement;
    trid = trparent.id;
    document.getElementById(trid).remove();
}

function goBack() {
    var url_string = window.location.href;
    var url = new URL(url_string);
    var params = new URLSearchParams(url.search);
    params.delete('OldID');
    window.history.back();
}

function approval_detalle(id, error_id = -1, mensaje = '') {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    var url = new URL(url_string);
    window.location.href = "/approvals-detalle?" + url.searchParams + "&RowID=" + id;
};
function approval_detalleAccess(id, user) {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    var url = new URL(url_string);
    window.location.href = "/approvals-detalle?" + url.searchParams + "&RowID=" + id;
};
function approval_detalle_view(id, error_id = -1, mensaje = '') {
    var url_string = window.location.href;
    var url = new URL(url_string);
    var params = new URLSearchParams(url.search);
    params.delete('RowID');
    window.location.href = "/approvals-detalle?" + params + "&RowID=" + id;
};

function url_dashboard(id, error_id = -1, mensaje = '') {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    url_string = url_string.replace('cmr_id', 'OldID')
    var url = new URL(url_string);
    window.location.href = "/approvals-detalle?" + url.searchParams + "&RowID=" + id;
};

function mercadeo_contacto_update(id) {
    var url_string = window.location.href;
    var url = new URL(url_string.replace("RowID", "OldID"));
    if (id == "home") {
        window.location.href = "/?" + url.searchParams.p + url.searchParams.db;
    } else {
        window.location.href = "/forms_mercadeo_update_contacto?" + url.searchParams + "&RowID=" + id;
    }
};

function datemin(objeto) {
    document.getElementById('freintegro').min = objeto.value;
    a = new Date(objeto.value)
    a.setDate(a.getDate() + 30);
    document.getElementById('freintegro').max = dateFormat(a, "dd-mm-yyyy");
}
function dateminA(objeto, id) {
    document.getElementById(id).min = objeto.value;
    a = new Date(objeto.value)
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    document.getElementById(id).value = `${day}/${month}/${year}`;
}


function check(object) {
    a = object.getAttribute("tag");
    b = document.getElementById(a);
    if (b.value == 1) {
        b.value = 0;
    } else {
        b.value = 1;
    }
}

function SearchTable() {
    var input = document.getElementById("SearchBox");
    var filter = input.value.toUpperCase(); 
    var table = document.getElementById("MainTable");
    var tr = table.getElementsByTagName("tr");
    var e = 0;

    for (var i = 0; i < tr.length; i++) {
        var find = false;

        if (tr[i].id !== 'header') {
            var td = tr[i].getElementsByTagName("td");

            for (var a = 0; a < td.length; a++) {
                var txtValue = td[a].textContent || td[a].innerText;

                if (txtValue.toUpperCase().indexOf(filter) > -1) {
                    find = true;
                    break; 
                }
            }

            if (find) {
                if (e % 2 == 0) {
                    tr[i].style.backgroundColor = "#fff";
                } else {
                    tr[i].style.backgroundColor = "#e5e5e5";
                }
                tr[i].style.display = "";
                e++;
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}


function SearchTableByContacts(grupo) {
    var input, table, tr, td, i, txtValue;
    filtro = []
    celdas = []
    fila = []
    companyVal = document.getElementById("SearchCompany").value.toUpperCase()
    typeVal = document.getElementById("SearchType").value.toUpperCase()
    businessLineVal = document.getElementById("SearchBusinessLine").value.toUpperCase()
    countryVal = document.getElementById("SearchCountry").value.toUpperCase()
    regionsVal = document.getElementById("SearchRegions").value.toUpperCase()
    nameVal = document.getElementById("SearchName").value.toUpperCase()
    emailVal = document.getElementById("SearchEmail").value.toUpperCase()
    positionVal = document.getElementById("SearchPosition").value.toUpperCase()
    locationVal = document.getElementById("SearchLocation").value.toUpperCase()
    table = document.getElementById("MainTable");
    tr = table.getElementsByTagName("tr");
    e = 0;
    for (i = 0; i < tr.length; i++) {
        if (tr[i].id != 'header') {
            const name = table.rows[i].cells[1].textContent.toUpperCase();
            const email = table.rows[i].cells[2].textContent.toUpperCase();
            const company = table.rows[i].cells[3].textContent.toUpperCase();
            const type = table.rows[i].cells[4].textContent.toUpperCase();
            const businessLine = table.rows[i].cells[5].textContent.toUpperCase();
            const country = table.rows[i].cells[6].textContent.toUpperCase();
            const regions = table.rows[i].cells[7].textContent.toUpperCase();
            const position = table.rows[i].cells[8].textContent.toUpperCase();
            const location = table.rows[i].cells[9].textContent.toUpperCase();
            if (company.includes(companyVal) &&
                type.includes(typeVal) &&
                businessLine.includes(businessLineVal) &&
                country.includes(countryVal) &&
                regions.includes(regionsVal) &&
                name.includes(nameVal) &&
                email.includes(emailVal) &&
                position.includes(positionVal) &&
                location.includes(locationVal)) {
                if (e % 2 == 0) {
                    tr[i].style.backgroundColor = "#fff";
                } else {
                    tr[i].style.backgroundColor = "#e5e5e5";
                }
                tr[i].style.display = "";
                e++;
            } else {
                tr[i].style.display = "none";
            }
        }
    }
}
// 
// por resumir
// 
function ShowOptionsMenu() {
    a = document.getElementById("OptionsMenu")
    if (a.className == 'optionsNone') {
        a.className = "options";
    } else if (a.className == 'options') {
        a.className = "optionsNone";
    }
}

function ActionApproval(estado, seleccion) {
    a = document.getElementById('ApprovalAction')
    if (a.className == 'ApprovalActionNone' || a.className == 'Not') {
        a.className = 'ApprovalAction'
        document.getElementById("ApprovalAsignacion").setAttribute("class", "Not")
    } else if (a.className == 'ApprovalAction') {
        a.className = 'ApprovalActionNone'
    }
    s = document.getElementById("AccionFinal");
    while (s.firstChild) {
        s.removeChild(s.firstChild);
    }
    var OPT1 = document.createElement('OPTION');
    var OPT2 = document.createElement('OPTION');
    if (estado == seleccion) {
        OPT1.setAttribute('value', estado);
        OPT1.setAttribute('selected', 'selected');
        OPT1.appendChild(document.createTextNode(estado));
        OPT2.setAttribute('value', "Rejected");
        OPT2.appendChild(document.createTextNode('Rejected'));
    } else {
        OPT1.setAttribute('value', seleccion);
        OPT1.appendChild(document.createTextNode(seleccion));
        OPT2.setAttribute('value', estado);
        OPT2.setAttribute('selected', 'selected');
        OPT2.appendChild(document.createTextNode(estado));
    }
    s.appendChild(OPT1);
    s.appendChild(OPT2);
}
// 
// 
//
function ActionApprovalPending(accion, seleccion, id, departamento, estado) {
    var popup = document.getElementById("ApprovalAction");
    var BGAction = document.getElementById("BGAction");
    popup.classList.toggle("Not");
    document.getElementById("ApprovalAsignacion").setAttribute("class", "Not")
    BGAction.classList.toggle("Not");
    s = document.getElementById("AccionFinal");
    while (s.firstChild) {
        s.removeChild(s.firstChild);
    }
    var OPT1 = document.createElement('OPTION');
    var OPT2 = document.createElement('OPTION');
    if (accion == seleccion) {
        OPT1.setAttribute('value', accion);
        OPT1.setAttribute('selected', 'selected');
        OPT1.appendChild(document.createTextNode(accion));
        OPT2.setAttribute('value', "Rejected");
        OPT2.appendChild(document.createTextNode('Rejected'));
    } else {
        OPT1.setAttribute('value', seleccion);
        OPT1.appendChild(document.createTextNode(seleccion));
        OPT2.setAttribute('value', accion);
        OPT2.setAttribute('selected', 'selected');
        OPT2.appendChild(document.createTextNode(accion));
    }
    s.appendChild(OPT1);
    s.appendChild(OPT2);
    document.getElementById("ID").value = id;
    document.getElementById("departamento").value = departamento;
    document.getElementById("estado").value = estado;
    JSONfromTXT(id, departamento, estado)
}

function JSONfromTXT(id, departamento, estado) {
    $.ajax({
        url: '/approval-json-txt',
        data: JSON.stringify({
            'id': id,
            'departamento': departamento,
            'estado': estado
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            a = document.getElementById("ArchivosApproval")
            // .innerHTML = result.detalle.links
            result.detalle.links.forEach(element => {
                div = document.createElement("div")
                div.innerHTML = element
                a.appendChild(div)
            });
        }
    })
}

// --- Dynamic actors refresh when Banco Ficohsa and monto changes ---

// Render a visible selector inside the actor card when a role has multiple participants
function renderVisibleActorSelector(role, items) {
    const visibleSel = document.getElementById('visible-selector-' + role);
    const nameSpan = document.getElementById('name-' + role);
    const cardDiv = document.getElementById('card-' + role);
    const hiddenSel = document.getElementById(role);
    if (!visibleSel) return;

    // Clear and repopulate visible select
    while (visibleSel.firstChild) visibleSel.removeChild(visibleSel.firstChild);
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select...';
    visibleSel.appendChild(placeholder);
    items.forEach(({ Name, UserID }) => {
        if (Name && Name !== '') {
            const op = document.createElement('option');
            op.value = Name;
            op.dataset.userid = UserID;
            op.textContent = Name;
            visibleSel.appendChild(op);
        }
    });

    // Show selector, hide static name span
    visibleSel.style.display = '';
    if (nameSpan) nameSpan.style.display = 'none';
    if (cardDiv) cardDiv.style.display = '';

    // On change: sync to hidden select + update photo
    visibleSel.onchange = function() {
        if (hiddenSel) {
            if (!this.value && hiddenSel.options.length > 0) {
                hiddenSel.selectedIndex = 0;
            } else {
                for (let i = 0; i < hiddenSel.options.length; i++) {
                    if (hiddenSel.options[i].value === this.value) {
                        hiddenSel.selectedIndex = i;
                        break;
                    }
                }
            }
        }
        const uid = this.options[this.selectedIndex]?.dataset?.userid || 'N/A';
        const photoImg = document.getElementById('photo-' + role);
        if (photoImg) {
            photoImg.src = (uid && uid !== 'N/A') ? 'pic/' + uid + '.png' : 'pic/default.png';
            photoImg.onerror = function() { this.src = 'pic/default.png'; this.onerror = null; };
        }
    };

    // Keep visible selector aligned with hidden value, then enforce hidden sync.
    let hasHiddenMatch = false;
    if (hiddenSel && hiddenSel.value) {
        for (let i = 0; i < visibleSel.options.length; i++) {
            if (visibleSel.options[i].value === hiddenSel.value) {
                hasHiddenMatch = true;
                break;
            }
        }
    }
    if (hasHiddenMatch) {
        visibleSel.value = hiddenSel.value;
    } else if (visibleSel.options.length > 1) {
        visibleSel.selectedIndex = 1;
    }
    visibleSel.onchange();
}

// Reset visible selector back to static display (for single-user case)
function resetVisibleActorSelector(role) {
    const visibleSel = document.getElementById('visible-selector-' + role);
    const nameSpan = document.getElementById('name-' + role);
    if (visibleSel) visibleSel.style.display = 'none';
    if (nameSpan) nameSpan.style.display = '';
}

function syncVisibleActorSelectorsToHidden() {
    ['firmante', 'operador'].forEach(function (role) {
        const visibleSel = document.getElementById('visible-selector-' + role);
        const hiddenSel = document.getElementById(role);
        if (!visibleSel || !hiddenSel || visibleSel.style.display === 'none') return;

        if (!visibleSel.value && visibleSel.options.length > 1) {
            visibleSel.selectedIndex = 1;
        }

        let matched = false;
        for (let i = 0; i < hiddenSel.options.length; i++) {
            if (hiddenSel.options[i].value === visibleSel.value) {
                hiddenSel.selectedIndex = i;
                matched = true;
                break;
            }
        }

        if (!matched && hiddenSel.options.length > 0) {
            hiddenSel.selectedIndex = 0;
        }
    });
}

// Helper: get display name from a procesos item ({Name,UserID} or [{Name,UserID},...])
function _actorName(item) {
    if (!item) return 'N/A';
    if (Array.isArray(item)) return item.map(o => o.Name || 'N/A').join(';');
    return item.Name != null ? String(item.Name) : String(item);
}

function updateActoresFromResult(result) {
    if (!result || result.result == 0) {
        return;
    }
    try {
        let estados = result.estados;
        let procesos = result.procesos;
        let temp_estados = [];
        let temp_placeholder = [];
        // "actores" is assumed global (defined elsewhere in original script)
        if (!Array.isArray(actores) || actores.length === 0) return;
        for (let i = 0; i < actores.length; i++) {
            if (i === 0) {
                temp_estados.push({ Name: 'N/A', UserID: 'N/A' });
            } else {
                if (estados[i] === 'manager' && estados[i]) {
                    let temp = i + actores.length - 1;
                    temp_estados.push(procesos[temp]);
                } else {
                    if (estados[i]) {
                        temp_estados.push(procesos[i]);
                    } else {
                        let temp = i + actores.length - 1;
                        temp_estados.push(procesos[temp]);
                    }
                }
            }
        }
        let temp_actores = temp_estados.reverse();
        const compania = Number(document.getElementById('compania')?.value || 0);
        const cflow = document.getElementById('approvals_select')?.value;
        if ((compania >= 2 && compania <= 5) || cflow === '67' || cflow === '120') {
            procesos = temp_actores.reverse();
        } else {
            for (let index = 0; index < temp_actores.length; index++) {
                if (temp_placeholder.some(p => _actorName(p) === _actorName(temp_actores[index]))) {
                    temp_placeholder.push({ Name: 'N/A', UserID: 'N/A' });
                } else {
                    temp_placeholder.push(temp_actores[index]);
                }
            }
            procesos = temp_placeholder.reverse();
        }
        for (let i = 1; i < actores.length; i++) {
            let sa = document.getElementById(actores[i]);
            if (!sa) continue;
            while (sa.firstChild) sa.removeChild(sa.firstChild);
            const item = procesos[i];
            if (actores[i] === 'operador' && Array.isArray(item)) {
                if (item.length > 1) {
                    // Populate hidden select (for form submission)
                    item.forEach(({ Name, UserID }) => {
                        if (Name && Name.trim() !== '') {
                            const op = document.createElement('option');
                            op.value = Name;
                            op.dataset.userid = UserID;
                            op.innerHTML = Name;
                            sa.appendChild(op);
                        }
                    });
                    // Render visible selector inside actor card
                    renderVisibleActorSelector('operador', item);
                } else {
                    resetVisibleActorSelector('operador');
                    item.forEach(({ Name, UserID }) => {
                        if (Name && Name.trim() !== '') {
                            const op = document.createElement('option');
                            op.value = Name;
                            op.dataset.userid = UserID;
                            op.innerHTML = Name;
                            sa.appendChild(op);
                        }
                    });
                }
            } else if (actores[i] === 'firmante') {
                if (Array.isArray(item)) {
                    if (item.length > 1) {
                        // Populate hidden select (for form submission)
                        item.forEach(({ Name, UserID }) => {
                            if (Name && Name !== '') {
                                const op = document.createElement('option');
                                op.value = Name;
                                op.dataset.userid = UserID;
                                op.innerHTML = Name;
                                sa.appendChild(op);
                            }
                        });
                        // Render visible selector inside actor card
                        renderVisibleActorSelector('firmante', item);
                    } else {
                        resetVisibleActorSelector('firmante');
                        item.forEach(({ Name, UserID }) => {
                            if (Name && Name !== '') {
                                const op = document.createElement('option');
                                op.value = Name;
                                op.dataset.userid = UserID;
                                op.innerHTML = Name;
                                sa.appendChild(op);
                            }
                        });
                    }
                } else {
                    resetVisibleActorSelector('firmante');
                    const op = document.createElement('option');
                    op.value = item?.Name || '';
                    op.dataset.userid = item?.UserID || 'N/A';
                    op.innerHTML = item?.Name || '';
                    sa.appendChild(op);
                }
            } else {
                if (actores[i] === 'operador') resetVisibleActorSelector('operador');
                const op = document.createElement('option');
                op.value = item?.Name || '';
                op.dataset.userid = item?.UserID || 'N/A';
                op.innerHTML = item?.Name || '';
                sa.appendChild(op);
            }
        }
        if (typeof updateActorCards === 'function') updateActorCards();
    } catch (err) {
        console.warn('Error updating actores dynamically:', err);
    }
}

function setupBancoFicohsaMontoListener() {
    const montoInput = document.getElementById('monto');
    if (!montoInput) return;
    montoInput.addEventListener('change', function () {
        if (!_formContextData) return;
        fill_actores();
    });
}

// Defer setup until DOM is ready in case script loads early
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBancoFicohsaMontoListener);
} else {
    setupBancoFicohsaMontoListener();
}

var searchSeq = 0;
var searchTimer = null;
var searchData = {};

function search() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () {
        b = global_search.value
        u = NombreUser.innerHTML
        UserID = UsuarioID.value
        var container = document.getElementById("seachresults")
        container.innerHTML = ""
        container.classList.remove("Not")
        if (b.length >= 3) {
            var seq = ++searchSeq;
            searchData = { loaded: {}, crm: null, crm_msg: null }

            container.innerHTML =
                '<div id="sect-approvals"><div class="search-section-title"><i class="fas fa-check-circle"></i> Approvals <i class="fas fa-spinner fa-spin" style="float:right;margin-top:2px"></i></div></div>' +
                '<div id="sect-crm"><div class="search-section-title"><i class="fas fa-headset"></i> CRM <i class="fas fa-spinner fa-spin" style="float:right;margin-top:2px"></i></div></div>' +
                '<div id="sect-empty" class="search-empty" style="display:none"><i class="fas fa-search"></i> No results found for "' + b + '"</div>'

            $.ajax({
                url: '/global_search/approvals',
                data: JSON.stringify({ busqueda: b, user: u, UserID }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (seq !== searchSeq) return;
                    searchData.loaded.approvals = 1
                    var section = document.getElementById('sect-approvals');
                    section.innerHTML = '';
                    if (result.search && result.search.length > 0) {
                        var title = document.createElement("div");
                        title.className = "search-section-title";
                        title.innerHTML = '<i class="fas fa-check-circle"></i> Approvals';
                        section.appendChild(title);
                        result.search.forEach(function (element) {
                            var a = document.createElement("a");
                            a.className = "search-result-item";
                            a.setAttribute("href", "#");
                            a.setAttribute("onclick", "approval_detalle(" + element.id + ");");
                            var text = element.detalle_proceso && element.detalle_proceso.toUpperCase().includes(b.toUpperCase())
                                ? element.detalle_proceso : element.proceso;
                            if (text) text = text.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
                            if (text && text.length > 55) text = text.substring(0, 55) + "...";
                            var info = '<strong>#' + element.id + '</strong> ' + (text || '') + ' <span class="search-status">' + (element.estado || '') + '</span>';
                            if (element.banco_nombre) info += ' <span class="search-meta"><i class="fas fa-university"></i> ' + element.banco_nombre + '</span>';
                            if (element.nombre_beneficiario) info += ' <span class="search-meta"><i class="fas fa-user"></i> ' + element.nombre_beneficiario + '</span>';
                            if (element.moneda && element.mmonto) info += ' <span class="search-meta">' + element.moneda + ' ' + Number(element.mmonto).toLocaleString() + '</span>';
                            if (element.solicitante_fecha) info += ' <span class="search-meta"><i class="fas fa-calendar-alt"></i> ' + element.solicitante_fecha.substring(0, 10) + '</span>';
                            a.innerHTML = info;
                            section.appendChild(a);
                        });
                    } else {
                        section.style.display = 'none';
                    }
                    checkSearchEmpty(seq);
                }
            })

            $.ajax({
                url: '/global_search/crm',
                data: JSON.stringify({ busqueda: b, user: u, UserID }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (seq !== searchSeq) return;
                    searchData.loaded.crm = 1;
                    searchData.crm = result.crm || [];
                    renderCRMSection(seq);
                }
            })

            $.ajax({
                url: '/global_search/crm_msg',
                data: JSON.stringify({ busqueda: b, user: u, UserID }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (seq !== searchSeq) return;
                    searchData.loaded.crm_msg = 1;
                    searchData.crm_msg = result.crm_msg || [];
                    renderCRMSection(seq);
                }
            })
        } else {
            container.classList.add("Not");
        }
    }, 250);
}

function renderCRMSection(seq) {
    var section = document.getElementById('sect-crm');
    if (!section || !searchData.loaded.crm) return;

    var crm = searchData.crm;
    var crm_msg = searchData.crm_msg;
    var hasContent = false;

    section.innerHTML = '';

    var msgsByCrm = {};
    if (crm_msg) {
        crm_msg.forEach(function (msg) {
            if (msg.ctipo == 3) return;
            if (!msgsByCrm[msg.id_main]) msgsByCrm[msg.id_main] = [];
            msgsByCrm[msg.id_main].push(msg);
        });
    }

    var renderedCrmIds = {};

    function renderMsgItem(msg) {
        var ma = document.createElement("a");
        ma.className = "search-result-item";
        ma.style.paddingLeft = "28px";
        ma.style.fontSize = "0.78rem";
        ma.setAttribute("href", "#");
        ma.setAttribute("onclick", "CRM_url(" + msg.id_main + ");");
        var msgText = msg.nombre_mensaje || '';
        if (msgText.length > 40) msgText = msgText.substring(0, 40) + "...";
        var bodySnippet = msg.body_mensaje_resumen || '';
        if (bodySnippet.length > 60) bodySnippet = bodySnippet.substring(0, 60) + "...";
        var minfo = ' <strong>' + msgText + '</strong>'
            + ' <span class="search-meta">' + (msg.de_nombre || '') + '</span>'
            + '<br><small style="color:#666;padding-left:20px;">' + bodySnippet + '</small>';
        ma.innerHTML = minfo;
        section.appendChild(ma);
    }

    function renderCrmEntry(id, prio, titulo, nombre, fecha) {
        var a = document.createElement("a");
        a.className = "search-result-item";
        a.setAttribute("href", "#");
        a.setAttribute("onclick", "CRM_url(" + id + ");");
        var prioIcon = '';
        if (prio == 2) prioIcon = '<span class="search-prio-urgent">!</span>';
        else if (prio == 1) prioIcon = '<span class="search-prio-important">!</span>';
        var text = titulo || '';
        if (text.length > 55) text = text.substring(0, 55) + "...";
        var info = prioIcon + ' <strong>#' + id + '</strong> ' + (text || '') + ' <span class="search-meta">' + (nombre || '') + '</span>';
        if (fecha) info += ' <span class="search-meta"><i class="fas fa-calendar-alt"></i> ' + fecha.substring(0, 10) + '</span>';
        a.innerHTML = info;
        section.appendChild(a);
    }

    if (crm.length > 0 || (crm_msg && Object.keys(msgsByCrm).length > 0)) {
        hasContent = true;
        var title = document.createElement("div");
        title.className = "search-section-title";
        title.innerHTML = '<i class="fas fa-headset"></i> CRM';
        section.appendChild(title);

        crm.forEach(function (element) {
            renderedCrmIds[element.id] = true;
            renderCrmEntry(element.id, element.cprioridad, element.conversacion_titulo || element.asunto_interno, element.de_nombre, element.fecha_ingreso);
            var msgs = msgsByCrm[element.id];
            if (msgs) msgs.forEach(renderMsgItem);
        });

        if (crm_msg) {
            Object.keys(msgsByCrm).forEach(function (idMain) {
                if (!renderedCrmIds[idMain]) {
                    var msgs = msgsByCrm[idMain];
                    var first = msgs[0];
                    renderCrmEntry(idMain, first.cprioridad, first.conversacion_titulo || first.asunto_interno, first.de_nombre, first.fecha_mensaje);
                    msgs.forEach(renderMsgItem);
                }
            });
        }

        if (!crm_msg) {
            var loading = document.createElement("div");
            loading.style.padding = "8px 16px 8px 28px";
            loading.style.fontSize = "0.78rem";
            loading.style.color = "#666";
            loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading messages...';
            section.appendChild(loading);
        }
    }

    if (hasContent) {
        section.style.display = '';
    } else {
        section.style.display = 'none';
    }
    checkSearchEmpty(seq);
}

function checkSearchEmpty(seq) {
    if (seq !== searchSeq) return;
    if (searchData.loaded.approvals && searchData.loaded.crm && searchData.loaded.crm_msg) {
        var hasAny = false;
        var sections = ['sect-approvals', 'sect-crm'];
        for (var i = 0; i < sections.length; i++) {
            var el = document.getElementById(sections[i]);
            if (el && el.style.display !== 'none') { hasAny = true; break; }
        }
        var emptyEl = document.getElementById('sect-empty');
        if (emptyEl) emptyEl.style.display = hasAny ? 'none' : 'block';
    }
}
function global_search_toggle() {
    a = document.getElementById("global_search")
    a.classList.toggle("Not")
    let b = a.classList
    if (b == 'form-control Not') {
        document.getElementById("seachresults").setAttribute("Class", "seachresults Not");
    }
    a.focus();
}

function UpdatePaid(id) {
    var v = 0
    if (id.checked) {
        v = 1
    }
    id = id.id.replace('chk-', '')
    $.ajax({
        url: '/approvals-paid',
        data: JSON.stringify({
            'v': v,
            'date': Date.now(),
            'id': id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) { }
    })
}

function AddFile(id_log, departamento, proceso, archivo_nombre, tipo) {
    $.ajax({
        url: '/add_files',
        data: JSON.stringify({
            id_log: id_log,
            departamento: departamento,
            proceso: proceso,
            archivo_nombre: archivo_nombre,
            tipo: tipo
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result == 'exito') {
                s = document.getElementById("ArchivosApproval");
                h = document.createElement("h5")
                h.innerHTML = "Files"
                s.appendChild(h)
                while (s.firstChild) {
                    s.removeChild(s.firstChild);
                }
                ArchivosApproval()
            }
        }
    })
}

function add_contact() {
    UserID = document.getElementById("UserID").value,
        nombre = document.getElementById("nombre").value,
        email = document.getElementById("email").value,
        cargo = document.getElementById("cargo").value,
        tipo = document.getElementById("tipo").value,
        pais = document.getElementById("pais").value,
        compania = document.getElementById("compania").value
    var validRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
    if (nombre == '' || email == '') {
        document.getElementById("mensaje").innerHTML = "Required fields are empty."
    } else {
        if (email.match(validRegex)) {
            $.ajax({
                url: "/forms_mercadeo_nuevo_contacto",
                data: JSON.stringify({
                    UserID: UserID,
                    nombre: nombre,
                    email: email,
                    cargo: cargo,
                    tipo: tipo,
                    pais: pais,
                    compania: compania
                }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (result.RowID > 0) {
                        document.getElementById("mensaje").innerHTML = "Success"
                        mercadeo_contacto_update(result.RowID)
                    } else {
                        document.getElementById("mensaje").innerHTML = "Error"
                    }
                }
            })
        } else {
            document.getElementById("mensaje").innerHTML = "Invalid email address."
        }
    }
}

function update_row(Form) {
    RowID = document.getElementById("RowID").value
    $.ajax({
        url: "/" + Form,
        data: JSON.stringify({
            RowID: document.getElementById("RowID").value,
            UserID: document.getElementById("UserID").value,
            nombre: document.getElementById("nombre").value,
            email: document.getElementById("email").value,
            cargo: document.getElementById("cargo").value,
            tipo: document.getElementById("tipo").value,
            pais: document.getElementById("pais").value,
            compania: document.getElementById("compania").value
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (Number(result.RowID) == Number(RowID)) {
                launch_toast("Successful Update", 1)
            } else {
                launch_toast("Error in Update", 2)
            }
        }
    })
}

function getApprovalFileExtension(filename) {
    var value = String(filename || '').toLowerCase();
    var dot = value.lastIndexOf('.');
    return dot >= 0 ? value.slice(dot) : '';
}

function getApprovalFileIcon(filename) {
    var ext = getApprovalFileExtension(filename);
    if (ext === '.pdf') return '/icons/pdf.png';
    if (ext === '.xls' || ext === '.xlsx' || ext === '.xlsm') return '/icons/excel.png';
    if (ext === '.doc' || ext === '.docx') return '/icons/word.png';
    if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') return '/icons/png.png';
    if (ext === '.msg') return '/img/envelope-regular.svg';
    return '/icons/default.png';
}

function escapeApprovalHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureApprovalMsgViewerOverlay() {
    var existing = document.getElementById('approval_msg_viewer_overlay');
    if (existing) return existing;

    var overlay = document.createElement('div');
    overlay.id = 'approval_msg_viewer_overlay';
    overlay.className = 'msg-viewer-overlay';

    var modal = document.createElement('div');
    modal.className = 'msg-viewer-modal';

    var header = document.createElement('div');
    header.className = 'msg-viewer-header';
    header.innerHTML = '<div class="msg-viewer-title">' +
        '<i class="fas fa-envelope-open"></i><span id="approval_msg_viewer_title">Email Message</span></div>';
    var closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'msg-viewer-close';
    closeBtn.onclick = function () { overlay.style.display = 'none'; };
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.id = 'approval_msg_viewer_body';
    body.className = 'msg-viewer-body';
    body.innerHTML = '<div class="msg-viewer-loading"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p style="margin-top:12px;">Loading message...</p></div>';

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.style.display = 'none';
    });
    document.body.appendChild(overlay);
    return overlay;
}

function formatApprovalRecipientList(list) {
    if (!list || !list.length) return '<span class="msg-viewer-recipients-empty">-</span>';
    return list.map(function (r) {
        var name = escapeApprovalHtml(r.name || '');
        var email = escapeApprovalHtml(r.email || '');
        if (name && email) return '<span class="msg-viewer-recipient-chip">' + name + ' &lt;' + email + '&gt;</span>';
        return '<span class="msg-viewer-recipient-chip">' + (name || email) + '</span>';
    }).join('');
}

function formatApprovalMsgDate(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleString(); } catch (_) { return String(d); }
}

function renderApprovalMsgViewerBody(data, RowID, filename) {
    var rows = '';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Subject</div><div class="msg-viewer-subject">' + escapeApprovalHtml(data.subject || '') + '</div></div>';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">From</div><div>' + formatApprovalRecipientList([data.from]) + '</div></div>';
    rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">To</div><div>' + formatApprovalRecipientList(data.to) + '</div></div>';
    if (data.cc && data.cc.length) {
        rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Cc</div><div>' + formatApprovalRecipientList(data.cc) + '</div></div>';
    }
    if (data.date) {
        rows += '<div class="msg-viewer-section"><div class="msg-viewer-section-label">Date</div><div class="msg-viewer-date">' + escapeApprovalHtml(formatApprovalMsgDate(data.date)) + '</div></div>';
    }

    if (data.attachments && data.attachments.length) {
        var attHtml = data.attachments.map(function (a) {
            var icon = getApprovalFileIcon(a.filename);
            var url = '/approval-msg-attachment?RowID=' + encodeURIComponent(RowID) +
                '&filename=' + encodeURIComponent(filename) +
                '&att_index=' + encodeURIComponent(a.index);
            return '<a href="' + url + '" download="' + escapeApprovalHtml(a.filename) + '" class="msg-viewer-attachment-link">' +
                '<img src="' + icon + '" style="width:18px;height:18px;">' + escapeApprovalHtml(a.filename) + '</a>';
        }).join('');
        rows += '<div class="msg-viewer-attachments"><div class="msg-viewer-section-label"><i class="fas fa-paperclip"></i> Attachments (' + data.attachments.length + ')</div>' + attHtml + '</div>';
    }

    rows += '<hr class="msg-viewer-divider">';

    var bodyContent;
    if (data.bodyHtml && data.bodyHtml.trim()) {
        bodyContent = '<iframe id="approval_msg_body_iframe" class="msg-viewer-iframe" sandbox="allow-same-origin"></iframe>';
    } else {
        var text = escapeApprovalHtml(data.bodyText || '').replace(/\r?\n/g, '<br>');
        bodyContent = '<div class="msg-viewer-plain">' + text + '</div>';
    }
    rows += '<div>' + bodyContent + '</div>';

    return rows;
}

function openApprovalMsgViewer(RowID, filename) {
    var overlay = ensureApprovalMsgViewerOverlay();
    overlay.style.display = 'flex';
    var body = document.getElementById('approval_msg_viewer_body');
    var title = document.getElementById('approval_msg_viewer_title');
    if (title) title.textContent = filename || 'Email Message';
    body.innerHTML = '<div class="msg-viewer-loading"><i class="fas fa-spinner fa-spin" style="font-size:32px;"></i><p style="margin-top:12px;">Loading message...</p></div>';

    var params = 'RowID=' + encodeURIComponent(RowID) +
        '&filename=' + encodeURIComponent(filename);

    fetch('/approval-msg-content?' + params)
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.result !== 1) {
                body.innerHTML = '<div class="msg-viewer-error"><i class="fas fa-exclamation-triangle" style="font-size:28px;"></i><p style="margin-top:10px;">' + escapeApprovalHtml(data.error || 'Could not load message') + '</p></div>';
                return;
            }

            body.innerHTML = renderApprovalMsgViewerBody(data, RowID, filename);
            if (data.bodyHtml && data.bodyHtml.trim()) {
                var iframe = document.getElementById('approval_msg_body_iframe');
                if (iframe) {
                    var doc = iframe.contentDocument || iframe.contentWindow.document;
                    var isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
                    var iframeStyle = isDarkTheme
                        ? 'body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#d8dee9;background:#11161c;margin:12px;}a{color:#8cc5d3;}img{max-width:100%;height:auto;}'
                        : 'body{font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;background:#fff;margin:12px;}img{max-width:100%;height:auto;}';
                    doc.open();
                    doc.write('<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>' + iframeStyle + '</style></head><body>' + data.bodyHtml + '</body></html>');
                    doc.close();
                    setTimeout(function () {
                        try {
                            var h = doc.body.scrollHeight;
                            if (h > 380) iframe.style.minHeight = Math.min(h + 20, 600) + 'px';
                        } catch (_) {}
                    }, 80);
                }
            }
        })
        .catch(function (err) {
            console.error('Approval msg content error:', err);
            body.innerHTML = '<div class="msg-viewer-error"><i class="fas fa-exclamation-triangle" style="font-size:28px;"></i><p style="margin-top:10px;">Error loading message</p></div>';
        });

    return false;
}

function ArchivosApproval(RowID = 0, options = {}) {
    var id = 0;
    var highlightFilename = '';
    var containerId = "ArchivosApproval"; // default container id
    
    if (typeof options === 'string') {
        // backward compatibility: second param could be highlightFilename or containerId
        if (options.includes('Approval') || options.startsWith('cr')) {
            containerId = options;
        } else {
            highlightFilename = options;
        }
    } else if (options && typeof options === 'object') {
        if (options.containerId) {
            containerId = options.containerId;
        }
        if (options.highlightFilename) {
            highlightFilename = String(options.highlightFilename);
        }
    }

    if (RowID) {
        id = RowID
    } else {
        id = document.getElementById("ID").value
    }
    var object = document.getElementById(containerId);
    if (!object) {
        return;
    }
    // Always repaint the files section to avoid duplicated rows on refresh.
    object.innerHTML = "";
    $.ajax({
        url: '/approval-lista-archivos',
        data: JSON.stringify({
            'RowID': id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                let container = document.createElement("div");
                let h = document.createElement("h6");
                h.innerHTML = "Files:";
                h.setAttribute("style", "display: inline");
                h.classList.add("titleDetail");
                container.appendChild(h);
                object.appendChild(container);

                response.files.forEach(function(item) {
                    if (item.type === 'header') {
                        var p = document.createElement("p");
                        p.innerHTML = item.content;
                        object.appendChild(p);
                        return;
                    }
                    if (item.type === 'claims_header') {
                        var ch = document.createElement("div");
                        ch.innerHTML = item.content;
                        object.appendChild(ch);
                        return;
                    }
                    if (item.type !== 'file') return;

                    var row = document.createElement("div");
                    row.className = "file_detalle";
                    row.setAttribute("data-filename", item.filename || "");

                    var nameSpan = document.createElement("span");
                    nameSpan.className = "file_text";
                    nameSpan.style.cursor = "pointer";
                    nameSpan.onclick = function(e) {
                        if (item.is_image || item.is_pdf) {
                            window.open(item.file_url, '_blank');
                        } else if (getApprovalFileExtension(item.filename) === '.msg') {
                            openApprovalMsgViewer(id, item.filename);
                        } else {
                            window.open(item.download_url, '_blank');
                        }
                    };
                    var displayName = item.filename;
                    if (item.is_pdf && Number(item.latest_version || 1) > 1) {
                        displayName += ' <small style="color:#00586f; font-weight:600;">(Latest v' + item.latest_version + ')</small>';
                    }
                    nameSpan.innerHTML = '<img src="' + item.icon + '" alt="File Icon" class="icon"> ' + displayName;
                    row.appendChild(nameSpan);

                    var actions = document.createElement("span");
                    actions.className = "file_actions";

                    if (item.is_image) {
                        // Images: open directly in browser
                        var link = document.createElement("a");
                        link.href = item.file_url;
                        link.target = "_blank";
                        link.title = "Open image";
                        link.innerHTML = '<i class="fas fa-external-link-alt secondIcon"></i>';
                        actions.appendChild(link);
                    } else if (item.is_pdf) {
                        // PDFs: preview/sign (with version selector), browser, download
                        var btnViewer = document.createElement("a");
                        btnViewer.href = "#";
                        btnViewer.title = "Preview versions & sign";
                        btnViewer.className = "file_action_btn";
                        btnViewer.innerHTML = '<i class="fas fa-signature secondIcon"></i>';
                        btnViewer.onclick = (function(rowId, fname) {
                            return function(e) {
                                e.preventDefault();
                                if (window.PdfViewerSign) {
                                    PdfViewerSign.open(rowId, fname, { version: 'latest' });
                                }
                            };
                        })(id, item.filename);

                        var btnBrowser = document.createElement("a");
                        btnBrowser.href = item.file_url;
                        btnBrowser.target = "_blank";
                        btnBrowser.title = "Open in browser";
                        btnBrowser.className = "file_action_btn";
                        btnBrowser.innerHTML = '<i class="fas fa-globe secondIcon"></i>';

                        var btnDownload = document.createElement("a");
                        btnDownload.href = item.download_url;
                        btnDownload.title = "Download";
                        btnDownload.className = "file_action_btn";
                        btnDownload.innerHTML = '<i class="fas fa-download secondIcon"></i>';

                        actions.appendChild(btnViewer);
                        actions.appendChild(btnBrowser);
                        actions.appendChild(btnDownload);
                    } else if (getApprovalFileExtension(item.filename) === '.msg') {
                        var btnOpenMsg = document.createElement('a');
                        btnOpenMsg.href = '#';
                        btnOpenMsg.title = 'Open email message';
                        btnOpenMsg.className = 'file_action_btn';
                        btnOpenMsg.innerHTML = '<i class="fas fa-envelope-open secondIcon"></i>';
                        btnOpenMsg.onclick = (function (rowId, fname) {
                            return function (e) {
                                e.preventDefault();
                                openApprovalMsgViewer(rowId, fname);
                                return false;
                            };
                        })(id, item.filename);

                        var msgDownloadBtn = document.createElement('a');
                        msgDownloadBtn.href = item.download_url;
                        msgDownloadBtn.title = 'Download';
                        msgDownloadBtn.className = 'file_action_btn';
                        msgDownloadBtn.innerHTML = '<i class="fas fa-download secondIcon"></i>';

                        actions.appendChild(btnOpenMsg);
                        actions.appendChild(msgDownloadBtn);
                    } else {
                        // Other files: download
                        var dlBtn = document.createElement("a");
                        dlBtn.href = item.download_url;
                        dlBtn.title = "Download";
                        dlBtn.className = 'file_action_btn';
                        dlBtn.innerHTML = '<i class="fas fa-download secondIcon"></i>';
                        actions.appendChild(dlBtn);
                    }

                    row.appendChild(actions);
                    object.appendChild(row);

                    if (highlightFilename && item.filename === highlightFilename) {
                        row.style.transition = 'background-color .35s ease, box-shadow .35s ease';
                        row.style.backgroundColor = '#fff3cd';
                        row.style.boxShadow = '0 0 0 2px rgba(255,193,7,.35)';
                        try {
                            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch (e) {
                            row.scrollIntoView();
                        }
                        setTimeout(function () {
                            row.style.backgroundColor = '';
                            row.style.boxShadow = '';
                        }, 3000);
                    }
                });
            } else {
                let container = document.createElement("div");
                container.innerHTML = '<small style="color:#777;">No files found.</small>';
                object.appendChild(container);
            }
        }
    })
}

function get_table_data(table_id) {
    myData = document.getElementById(table_id).rows
    my_liste = []
    for (var i = 0; i < myData.length; i++) {
        el = myData[i].children
        my_el = []
        for (var j = 0; j < el.length; j++) {
            my_el.push(el[j].innerText);
        }
        my_liste.push(my_el)
    }
    return my_liste
}

function mercadeo_exp_contact() {
    companyVal = document.getElementById("SearchCompany").value
    typeVal = document.getElementById("SearchType").value
    businessLineVal = document.getElementById("SearchBusinessLine").value
    countryVal = document.getElementById("SearchCountry").value
    regionsVal = document.getElementById("SearchRegions").value
    nameVal = document.getElementById("SearchName").value
    emailVal = document.getElementById("SearchEmail").value
    positionVal = document.getElementById("SearchPosition").value
    locationVal = document.getElementById("SearchLocation").value
    $.ajax({
        url: '/mecardeo_exp_main',
        data: JSON.stringify({
            companyVal: companyVal,
            typeVal: typeVal,
            businessLineVal: businessLineVal,
            countryVal: countryVal,
            regionsVal: regionsVal,
            nameVal: nameVal,
            emailVal: emailVal,
            positionVal: positionVal,
            locationVal: locationVal
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result == 1) {
                window.location = "sir://mercadeo_export||Contacs.xlsx"
            }
        }
    })
}

function mercadeo_delete_contactos(id = []) {
    // Eliminar contactos segun array de IDs que pasen
    $.ajax({
        url: '/mercadeo_delete_contactos',
        data: JSON.stringify({
            id: id
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result > 0) {
                table = document.getElementById("MainTable");
                tr = table.getElementsByTagName("tr");
                for (e = 0; e < id.length; e++) {
                    hijo = document.getElementById(id[e])
                    const sub_padre = hijo.parentNode;
                    const padre = sub_padre.parentNode;
                    padre.remove();
                }
                // Arreglar estilo de la tabla despues de borrar las filas
                e = 0;
                for (i = 0; i < tr.length; i++) {
                    if (tr[i].id != 'header') {
                        if (e % 2 == 0) {
                            tr[i].style.backgroundColor = "#fff";
                        } else {
                            tr[i].style.backgroundColor = "#e5e5e5";
                        }
                        tr[i].style.display = "";
                        e++;
                    }
                }
                if (result.result > 1) {
                    texto = result.result + " contacts deleted."
                } else { texto = result.result + " contact deleted." }
                icono = 1
                document.getElementById("delete_rows").classList.add("Not")
                // get_contactos_eliminados()
            } else {
                texto = "Error performing delete action."
                icono = 2
            }
            launch_toast(texto, icono)
        }
    })

}

function get_contactos_eliminados() {
    $.ajax({
        url: '/mercadeo_contactos_eliminados',
        data: JSON.stringify({}),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result > 0) {
                document.getElementById("restore_rows").classList.remove("Not")
            } else {
                document.getElementById("restore_rows").classList.add("Not")
            }
        }
    })

}

function restaurar_contactos_eliminados() {
    $.ajax({
        url: '/restaurar_contactos_eliminados',
        data: JSON.stringify({}),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result > 0) {
                // document.getElementById("restore_rows").classList.remove("Not")
            } else {
                // document.getElementById("restore_rows").classList.add("Not")
            }
        }
    })

}

function ObtenerCheckboxSeleccionados() {
    const checkboxes = document.querySelectorAll('table input[type="checkbox"]:checked');
    const ids = [];

    checkboxes.forEach((checkbox) => {
        ids.push(checkbox.id);
    });

    return ids;
}

function launch_toast(texto, icono = 0) {
    if (texto != '') {
        i = document.createElement("i")
        switch (icono) {
            case 1:
                i.classList.add("fa-check")
                break;
            case 2:
                i.classList.add("fa-exclamation-triangle")
                break;
            default:
                icono = -1
                break
        }
        var x = document.getElementById("toast")
        document.getElementById("notificacion_texto").innerHTML = texto
        x.className = "show";
        i.classList.add("fas")
        i.setAttribute("id", "notificacion_icono")
        document.getElementById("notificacion_img").appendChild(i)
        setTimeout(function () {
            x.className = x.className.replace("show", "");
            document.getElementById("notificacion_icono").remove()
        }, 5000);
    }
}

function CRM_url(id, error_id = -1, mensaje = '') {
    const userid = (document.getElementById('UserID') && document.getElementById('UserID').value)
        || (document.getElementById('UsuarioID') && document.getElementById('UsuarioID').value)
        || new URL(window.location.href).searchParams.get('p')
        || '';
    if (typeof validateAndNavigateToCrm === 'function') {
        validateAndNavigateToCrm(id, userid);
    } else {
        var url_string = window.location.href;
        url_string = url_string.replace('RowID', 'OldID')
        url_string = url_string.replace('crm_id', 'OldID')
        var url = new URL(url_string);
        window.location.href = "/crm_msg?" + url.searchParams + "&crm_id=" + id;
    }
};

// Validar acceso a CRM antes de navegar
async function validateAndNavigateToCrm(crmId, userid) {
    try {
        const response = await fetch('/crm_validate_access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ crm_id: parseInt(crmId), userid: userid })
        });
        
        const data = await response.json();
        
        if (data.result === 1 && data.hasAccess) {
            // Usuario tiene acceso, navegar a la vista
            window.location.href = `/crm_msg?crm_id=${crmId}`;
        } else {
            // Usuario no tiene acceso, mostrar toast
            launch_toast('No access to this CRM', 2);
        }
    } catch (err) {
        console.error('Error validating CRM access:', err);
        launch_toast('Error validating access', 2);
    }
}

function crear_estado() {
    //Regresa el estado segun el primer actor que no sea N/A
    estado = ''
    for (i = 1; i < actores.length; i++) {
        valor = document.getElementById(actores[i]).value
        if (valor != 'N/A') {
            switch (i) {
                case 1:
                    estado = 'Verify'
                    break
                case 2:
                    estado = 'Approve'
                    break
                case 3:
                    estado = 'Signature'
                    break
                case 4:
                    estado = 'Apply'
                    break
                case 5:
                    estado = 'Execute'
                    break
            }
            break
        }
    }
    return estado
}

function get_usuarios_by_manager(target_select, UserID) {
    try {
        uasignar = document.getElementById(target_select)
        // cdepartamento = document.getElementById("cdepatamento").value
        $.ajax({
            url: '/get_usuarios_by_manager',
            data: JSON.stringify({ UserID: UserID }),
            type: 'POST',
            contentType: 'application/json',
            success: function (result) {
                if (result.result == 1) {
                    users = result.users
                    for (i = 0; i < users.length; i++) {
                        op = document.createElement("option")
                        op.value = users[i].Name
                        op.innerHTML = users[i].Name
                        uasignar.appendChild(op)
                    }
                } else {
                    // launch_toast("Error getting list of users.", 2)
                }
            }
        })

    } catch (error) {
        console.log(error)
    }

}

function get_approval_pending(UserID, titulo) {
    $.ajax({
        url: '/get_approvals',
        type: 'GET',
        success: function (response) {
            if (response.result == 0) {
                console.log(response)
            } else {
                nombre_actor = false
                if (titulo.includes("Dashboard")) {
                    filldata = ["ApprovalsRunning", "ApprovalsPending", "ApprovalsTotal", "ApprovalsRejected", "ApprovalsinProgress"]
                    for (i = 0; i < filldata.length; i++) {
                        if (filldata[i] == "ApprovalsRunning") {
                            document.getElementById(filldata[i]).innerHTML = response.UserTotalEjecutando
                        }
                        if (filldata[i] == "ApprovalsPending") {
                            document.getElementById(filldata[i]).innerHTML = response.UserTotalPending
                        }
                        if (filldata[i] == "ApprovalsTotal") {
                            document.getElementById(filldata[i]).innerHTML = response.UserTotal
                        }
                        if (filldata[i] == "ApprovalsRejected") {
                            document.getElementById(filldata[i]).innerHTML = response.UserTotalRechazado
                        }
                    }
                }
                else {
                    if (titulo.includes("Approvals Pending")) {
                        log = response.log_pendiente
                    }
                    if (titulo.includes("Approvals Approved")) {
                        log = response.log_ejecutados
                    }
                    if (titulo.includes("Approvals Rejected")) {
                        log = response.log_rechazados
                    }
                    if (titulo.includes("Approvals in Progress")) {
                        log = response.log_ejecutando
                    }
                    for (i = 0; i < log.length; i++) {
                        existe_tabla = false
                        tables = document.getElementsByTagName("table")
                        if (log[i].departamento == 'Claims' || log[i].departamento == 'Underwriting') {
                            proceso = log[i].departamento
                        } else {
                            proceso = log[i].proceso
                        }
                        for (let e = 0; e < tables.length; e++) {
                            if (tables[e].id == "tabla_" + proceso) {
                                existe_tabla = true
                            }
                        }
                        if (existe_tabla) {
                        } else {
                            h = document.createElement("h4")
                            h.innerHTML = proceso
                            tabla = document.createElement("table")
                            tabla.id = "tabla_" + proceso
                            tabla.classList = "fixed_headers"
                            thead = document.createElement("thead")
                            tr = document.createElement("tr")
                            th = document.createElement("th")
                            th.innerHTML = "ID"
                            th.setAttribute("style", "width:7%;")
                            th.className = "link_tabla clic text-decoration-underline text-center"
                            tr.appendChild(th)
                            th = document.createElement("th")
                            th.innerHTML = "Process Details"
                            th.setAttribute("style", "width:50%;")
                            tr.appendChild(th)
                            th = document.createElement("th")
                            th.innerHTML = "Requested By"
                            tr.appendChild(th)
                            th = document.createElement("th")
                            th.innerHTML = "Start Date"
                            tr.appendChild(th)
                            th = document.createElement("th")
                            th.innerHTML = "Status"
                            tr.appendChild(th)
                            // tbody = document.createElement("tbody")
                            if (titulo.includes("Approvals in Progress")) {
                                th = document.createElement("th")
                                th.innerHTML = "Pending by"
                                tr.appendChild(th)
                            }
                            thead.appendChild(tr)
                            tabla.appendChild(thead)
                            document.getElementById("table-container").appendChild(h)
                            document.getElementById("table-container").appendChild(tabla)
                        }
                    }
                    e = 0
                    for (i = 0; i < log.length; i++) {
                        if (log[i].departamento == 'Claims' || log[i].departamento == 'Underwriting') {
                            proceso = log[i].departamento
                        } else {
                            proceso = log[i].proceso
                        }
                        tabla = document.getElementById("tabla_" + proceso)
                        tr = document.createElement("tr")
                        id = document.createElement("td")
                        id.setAttribute("id", log[i].id)
                        // a = document.createElement("a")
                        id.setAttribute("onclick", "approval_detalle(" + log[i].id + ")")
                        // a.setAttribute("href", "#")
                        id.className = "relation-id-link"
                        id.innerHTML = log[i].id
                        id.className += " link_tabla clic text-decoration-underline text-center"
                        // id.appendChild(a)
                        tr.appendChild(id)
                        proceso = document.createElement("td")
                        proceso.innerHTML = log[i].proceso + " - " + log[i].detalle_proceso
                        tr.appendChild(proceso)
                        solicitante = document.createElement("td")
                        solicitante.innerHTML = log[i].solicitante
                        tr.appendChild(solicitante)
                        s_fecha = document.createElement("td")
                        s_fecha.innerHTML = log[i].s_fecha
                        tr.appendChild(s_fecha)
                        estado = document.createElement("td")
                        estado.innerHTML = log[i].estado
                        actorid = acciones.indexOf(log[i].estado)
                        tr.appendChild(estado)
                        if (nombre_actor) {
                            actor = document.createElement("td")
                            actor.innerHTML = log[i].estado
                            tr.appendChild(actor)
                        }
                        if (titulo.includes("Approvals in Progress")) {
                            actor = document.createElement("td")
                            actor.innerHTML = log[i][actores[actorid]]
                            tr.appendChild(actor)
                        }
                        // if (e % 2 == 0) {
                        //     tr.style.backgroundColor = "#fff";
                        // } else {
                        //     tr.style.backgroundColor = "#e5e5e5";
                        // }
                        e++;
                        tabla.appendChild(tr)
                    }
                }
            }
        }
    })
}

function get_approval_asignado(RowID) {
    $.ajax({
        url: '/get_approval_asignado',
        data: JSON.stringify({
            RowID: RowID
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 0) {
                launch_toast("Error loading asignado", 2)
            } else {
                flow_row = response.flow_row
                MainTableTbody = document.getElementById("MainTableTbody")
                fechas = ["ejecutor_fecha", "operador_fecha", "firmante_fecha", "aprobador_fecha", "verificador_fecha", "solicitante_fecha"]
                actores_invertidos = actores.reverse();
                acciones_reealizadas_invertidos = acciones_reealizadas.reverse();
                if (flow_row.length > 0) {
                    document.getElementById("DivApprovalAsignado").classList.remove("Not");
                    for (i = 0; i < flow_row.length; i++) {
                        for (e = 0; e < fechas.length; e++) {
                            if (flow_row[i][fechas[e]]) {
                                tr = document.createElement("tr")
                                td = document.createElement("td")
                                td.innerHTML = flow_row[i].id
                                tr.appendChild(td)
                                td = document.createElement("td")
                                date = new Date(flow_row[i][fechas[e]])
                                td.innerHTML = date.toLocaleDateString()
                                tr.appendChild(td)
                                td = document.createElement("td")
                                td.innerHTML = flow_row[i][actores_invertidos[e]]
                                tr.appendChild(td)
                                td = document.createElement("td")
                                if (flow_row[i].estado_log != 'Rejected')
                                    td.innerHTML = acciones_reealizadas_invertidos[e]
                                else
                                    td.innerHTML = 'Rejected'
                                tr.appendChild(td)
                                MainTableTbody.appendChild(tr)
                            }
                        }
                    }
                }
            }
        }
    })
}

function update_approval_asignado(RowID, estado) {
    $.ajax({
        url: '/update_approval_asignado',
        data: JSON.stringify({
            RowID,
            estado
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                console.log(response)
            }
        }
    })
}

function copy_files_approvals(RowID, oldRowID, cflow) {
    $.ajax({
        url: '/copy_files_approvals',
        data: JSON.stringify({
            RowID: RowID,
            oldRowID: oldRowID,
            cflow: cflow
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result == 0) {
                launch_toast("Error loading Approvals", 2)
            } else { }
        }
    })
}

function agregar_approval_asignado(RowID, OldRowID, estado) {
    $.ajax({
        url: '/agregar_approval_asignado',
        data: JSON.stringify({
            RowID: RowID,
            OldRowID: OldRowID,
            estado: estado
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (result) {
            if (result.result == 0) {
                launch_toast("Error in table asignado", 2)
            } else { }
        }
    })
}

// ══════════════════════════════════════════════════════════════════════════════
// Unified Form Context Cache — replaces separate AJAX calls to
// /get_companias, /get_departamento, /get_flows, /get_procesos, /get_actores,
// /get_bancos, /get_monedas with a single /post-user-request call.
// ══════════════════════════════════════════════════════════════════════════════
let _formContextData = null;

function _loadFormContext(callback) {
    const username = document.getElementById("username")?.value;
    $.ajax({
        url: '/post-user-request',
        data: JSON.stringify({ user_id: username }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result !== 1) {
                launch_toast("Error loading form context", 2);
                return;
            }
            _formContextData = response.data;
            if (typeof callback === 'function') callback();
        },
        error: function () {
            launch_toast("Error loading form context", 2);
        }
    });
}

function _getSelectedFlow() {
    if (!_formContextData) return null;
    const cflow = document.getElementById('approvals_select')?.value;
    return _formContextData.flows.find(function (f) { return String(f.id) === String(cflow); }) || null;
}

function fill_moneda() {
    if (!_formContextData) return;
    const flow = _getSelectedFlow();
    if (!flow || !flow.banks) return;
    const bancoValue = document.getElementById("banco").value;
    const bankData = flow.banks.find(function (b) { return String(b.banco_id) === String(bancoValue); });
    const monedas = bankData ? bankData.monedas : [];
    const moneda = document.getElementById("moneda");
    moneda.innerHTML = '';
    if (!bankData || monedas.length === 0 || monedas.every(function(m) { return m === ''; })) {
        var op = document.createElement("option");
        op.value = 'USD'; op.text = 'USD';
        moneda.appendChild(op);
        moneda.value = 'USD';
        fill_actores();
        var monedaEl = document.getElementById('moneda');
        if (monedaEl) monedaEl.dataset.touched = 'false';
        if (typeof window['clearSelectError_moneda'] === 'function') window['clearSelectError_moneda']();
        return;
    }
    // Always put USD first, then the rest
    var op = document.createElement("option");
    op.value = 'USD'; op.text = 'USD';
    moneda.appendChild(op);
    for (let index = 0; index < monedas.length; index++) {
        if (monedas[index] !== '' && monedas[index] !== 'USD') {
            const option = document.createElement("option");
            option.value = monedas[index];
            option.text = monedas[index];
            moneda.appendChild(option);
        }
    }
    fill_actores();
    // Reset visual state after programmatic repopulation
    var monedaEl = document.getElementById('moneda');
    if (monedaEl) monedaEl.dataset.touched = 'false';
    if (typeof window['clearSelectError_moneda'] === 'function') window['clearSelectError_moneda']();
}

function _populateActorSelects(procesos) {
    for (let i = 1; i < actores.length; i++) {
        const sa = document.getElementById(actores[i]);
        if (!sa) continue;
        while (sa.firstChild) sa.removeChild(sa.firstChild);
        const item = procesos[i];
        if (actores[i] === "operador" && Array.isArray(item)) {
            if (item.length > 1) {
                item.forEach(function (u) {
                    if (u.Name && u.Name.trim() !== '') {
                        const op = document.createElement('option');
                        op.value = u.Name; op.dataset.userid = u.UserID; op.innerHTML = u.Name;
                        sa.appendChild(op);
                    }
                });
                renderVisibleActorSelector('operador', item);
            } else {
                resetVisibleActorSelector('operador');
                item.forEach(function (u) {
                    if (u.Name && u.Name.trim() !== '') {
                        const op = document.createElement('option');
                        op.value = u.Name; op.dataset.userid = u.UserID; op.innerHTML = u.Name;
                        sa.appendChild(op);
                    }
                });
            }
        } else if (actores[i] === "firmante") {
            if (Array.isArray(item)) {
                if (item.length > 1) {
                    item.forEach(function (u) {
                        if (u.Name && u.Name !== '') {
                            const op = document.createElement('option');
                            op.value = u.Name; op.dataset.userid = u.UserID; op.innerHTML = u.Name;
                            sa.appendChild(op);
                        }
                    });
                    renderVisibleActorSelector('firmante', item);
                } else {
                    resetVisibleActorSelector('firmante');
                    item.forEach(function (u) {
                        if (u.Name && u.Name !== '') {
                            const op = document.createElement('option');
                            op.value = u.Name; op.dataset.userid = u.UserID; op.innerHTML = u.Name;
                            sa.appendChild(op);
                        }
                    });
                }
            } else {
                resetVisibleActorSelector('firmante');
                const op = document.createElement('option');
                op.value = item?.Name || '';
                op.dataset.userid = item?.UserID || 'N/A';
                op.innerHTML = item?.Name || '';
                sa.appendChild(op);
            }
        } else {
            if (actores[i] === 'operador') resetVisibleActorSelector('operador');
            const op = document.createElement('option');
            op.value = item?.Name || '';
            op.dataset.userid = item?.UserID || 'N/A';
            // Staff flows show "Active Re staff"
            if (item?.Name && item.Name.toLowerCase().includes('staff')) {
                op.innerHTML = 'Active Re staff';
            } else {
                op.innerHTML = item?.Name || '';
            }
            sa.appendChild(op);
        }
    }
    if (typeof updateActorCards === 'function') updateActorCards();
}

function _resolveActors(flow, bancoOverride) {
    const compania = Number(document.getElementById("compania")?.value || 0);
    const cflow = document.getElementById("approvals_select")?.value;
    const bancoValue = bancoOverride || (document.getElementById("banco")?.value || '');
    const monto = Number(document.getElementById("monto")?.value || 0);

    let procesos, estados;
    if (bancoValue && bancoValue !== 'N/A' && bancoValue !== '' && flow.banks && flow.banks.length > 0) {
        const bankData = flow.banks.find(function (b) { return String(b.banco_id) === String(bancoValue); });
        if (bankData) {
            procesos = bankData.procesos.slice();
            estados = bankData.estados.slice();
        } else {
            procesos = flow.procesos.slice();
            estados = flow.estados.slice();
        }
    } else {
        procesos = flow.procesos.slice();
        estados = flow.estados.slice();
    }

    // Monto-based filtering for flow 2 (Ericka Castillo / Tatiana Del Barrio)
    const bancosTatiana = ['1', '17', '26', '5', '16', '28'];
    if (String(flow.id) === '2') {
        for (let i = 0; i < procesos.length; i++) {
            const item = procesos[i];
            const nameStr = Array.isArray(item) ? item.map(function (o) { return o.Name; }).join(';') : (item?.Name || '');
            if (nameStr.includes("Ericka Castillo") && monto >= 100000) {
                procesos[i] = Array.isArray(item) ? item.filter(function (o) { return o.Name.includes("Ericka Castillo"); }) : item;
            } else if (nameStr.includes("Tatiana Del Barrio") && (monto < 100000 || !monto) && bancosTatiana.includes(String(bancoValue))) {
                procesos[i] = Array.isArray(item) ? item.filter(function (o) { return o.Name.includes("Tatiana Del Barrio"); }) : item;
            }
        }
    }

    // Duplicate actor removal
    let temp_estados = [];
    let temp_placeholder = [];
    for (let i = 0; i < actores.length; i++) {
        if (i === 0) {
            temp_estados.push({ Name: 'N/A', UserID: 'N/A' });
        } else {
            if (estados[i] === 'manager' && estados[i]) {
                temp_estados.push(procesos[i + actores.length - 1]);
            } else {
                if (estados[i]) {
                    temp_estados.push(procesos[i]);
                } else {
                    temp_estados.push(procesos[i + actores.length - 1]);
                }
            }
        }
    }
    let temp_actores = temp_estados.reverse();
    if ((compania >= 2 && compania <= 5) || cflow === '67' || cflow === '120') {
        procesos = temp_actores.reverse();
    } else {
        for (let index = 0; index < temp_actores.length; index++) {
            if (temp_placeholder.some(function (p) { return _actorName(p) === _actorName(temp_actores[index]); })) {
                temp_placeholder.push({ Name: 'N/A', UserID: 'N/A' });
            } else {
                temp_placeholder.push(temp_actores[index]);
            }
        }
        procesos = temp_placeholder.reverse();
    }
    return procesos;
}

function fill_actores() {
    if (!_formContextData) return;
    const flow = _getSelectedFlow();
    if (!flow) return;
    const procesos = _resolveActors(flow);
    _populateActorSelects(procesos);
    const estado = document.getElementById("estado");
    if (estado) {
        estado.value = crear_estado();
        estado.innerHTML = estado.value;
    }
}

function fill_select_moneda(monedas = []) {
    const monedaEl = document.getElementById("moneda")
    monedaEl.innerHTML = ''
    banco = document.getElementById("banco")
    if ((!banco || banco.value === 'N/A' || banco.value === '') && monedas.length === 0) {
        var op = document.createElement("option")
        op.value = 'USD'; op.innerHTML = 'USD'
        monedaEl.appendChild(op)
        if (typeof window['clearSelectError_moneda'] === 'function') window['clearSelectError_moneda']()
        return
    }
    ctipo_flujo = document.getElementById("ctipo").value
    ccompania = document.getElementById("compania").value

    // Always put USD first, then the rest
    var op = document.createElement("option")
    op.value = 'USD'; op.innerHTML = 'USD'
    monedaEl.appendChild(op)
    for (o = 0; o < monedas.length; o++) {
        if (monedas[o].xabrev_moneda !== 'USD') {
            var op = document.createElement("option")
            op.value = monedas[o].xabrev_moneda
            op.innerHTML = monedas[o].xnombre_moneda_ingles
            monedaEl.appendChild(op)
        }
    }
    if (typeof window['clearSelectError_moneda'] === 'function') window['clearSelectError_moneda']();
}

function fill_companias(ccompania) {
    _loadFormContext(function () {
        if (!_formContextData) return;
        const companias = _formContextData.companies;
        const compania = document.getElementById("compania");
        while (compania.firstChild) compania.removeChild(compania.firstChild);
        for (let index = 0; index < companias.length; index++) {
            const option = document.createElement("option");
            option.value = companias[index].ccompania;
            option.text = companias[index].xnombre;
            compania.appendChild(option);
        }
        if (compania && compania.options.length > 0) {
            compania.dispatchEvent(new Event('change'));
        }
        fill_flows();
        const dep_inicio = document.getElementById("id_dep_inicio").value;
        if (dep_inicio.includes("1;") || dep_inicio.includes("3;")) {
            document.getElementById("signature_div").setAttribute("Class", "row");
        } else {
            document.getElementById("signature_div").setAttribute("Class", "Not");
        }
    });
}

function fill_bancos() {
    if (!_formContextData) return;
    const flow = _getSelectedFlow();
    if (!flow || !flow.banks || flow.banks.length === 0) {
        const moneda = document.getElementById("moneda");
        if (moneda) {
            moneda.innerHTML = '';
            var op = document.createElement("option");
            op.value = 'USD'; op.text = 'USD';
            moneda.appendChild(op);
            moneda.value = 'USD';
        }
        return;
    }
    const banco = document.getElementById("banco");
    while (banco.firstChild) banco.removeChild(banco.firstChild);
    document.getElementById("paymnet_div").setAttribute("Class", "row");
    for (let index = 0; index < flow.banks.length; index++) {
        const option = document.createElement("option");
        option.value = flow.banks[index].banco_id;
        option.text = flow.banks[index].xnombre;
        banco.appendChild(option);
    }
    const bancoEl = document.getElementById("banco");
    if (bancoEl && bancoEl.options.length > 0) bancoEl.dispatchEvent(new Event('change'));
    fill_moneda();
    if (typeof window.toggleLuxForm === 'function') window.toggleLuxForm();
    if (typeof window.tryGenerateBeneficiaryPdf === 'function') window.tryGenerateBeneficiaryPdf();
    // Ensure no premature red state after banco repopulation
    ['banco', 'moneda', 'monto'].forEach(function(id) {
        var fe = document.getElementById(id);
        if (!fe) return;
        fe.dataset.touched = 'false';
        if (typeof window['clearSelectError_' + id] === 'function') window['clearSelectError_' + id]();
        else if (typeof window['clearInputError_' + id] === 'function') window['clearInputError_' + id]();
    });
}

function fill_flows() {
    if (!_formContextData) return;
    const titleElement = document.getElementById("titlename");
    const title = titleElement ? titleElement.innerHTML : "without title";
    const approvals_select = document.getElementById('approvals_select');
    const compania = document.getElementById("compania").value;

    // Filter flows by selected company from cache
    let flows = _formContextData.flows.filter(function (f) { return String(f.ccompania) === String(compania); });

    while (approvals_select.firstChild) approvals_select.removeChild(approvals_select.firstChild);

    if (title.includes("Performance Review")) {
        flows = flows.filter(function (f) { return f.nombre === "Performance Review Delivery"; });
        for (let i = 0; i < flows.length; i++) {
            const o = document.createElement("option");
            o.innerHTML = flows[i].nombre;
            o.value = flows[i].id;
            approvals_select.appendChild(o);
            if (i === 0) document.getElementById("ctipo").value = flows[i].ctipo_flujo;
        }
    } else if (title.includes("Personnel Requisition")) {
        flows = flows.filter(function (f) { return f.nombre === "Personnel Requisition Form"; });
        for (let i = 0; i < flows.length; i++) {
            const o = document.createElement("option");
            o.innerHTML = flows[i].nombre;
            o.value = flows[i].id;
            approvals_select.appendChild(o);
            if (i === 0) document.getElementById("ctipo").value = flows[i].ctipo_flujo;
        }
    } else {
        flows = flows.filter(function (f) {
            return f.nombre !== "Performance Review Delivery" && f.nombre !== "Personnel Requisition Form";
        });

        const groupOrder = [];
        const grouped = {};
        for (let i = 0; i < flows.length; i++) {
            const dep = flows[i].dep_nombre || 'Other';
            if (!grouped[dep]) { grouped[dep] = []; groupOrder.push(dep); }
            grouped[dep].push(flows[i]);
        }

        let firstFlow = null;
        for (const dep of groupOrder) {
            const og = document.createElement('optgroup');
            og.label = dep;
            const items = grouped[dep];
            for (let j = 0; j < items.length; j++) {
                const f = items[j];
                const o = document.createElement('option');
                o.innerHTML = f.nombre;
                o.value = f.id;
                og.appendChild(o);
                if (!firstFlow) firstFlow = f;
            }
            approvals_select.appendChild(og);
        }

        if (firstFlow && firstFlow.ctipo_flujo != null) {
            document.getElementById("ctipo").value = firstFlow.ctipo_flujo;
        }
    }

    const approvals_selectEl = document.getElementById('approvals_select');
    if (approvals_selectEl && approvals_selectEl.options.length > 0) approvals_selectEl.dispatchEvent(new Event('change'));
    fill_procesos();
}

function _syncRequired(id, isRequired) {
    const el = document.getElementById(id);
    if (!el) return;
    if (isRequired) {
        el.setAttribute('required', 'required');
        el.dataset.required = 'true';
    } else {
        el.removeAttribute('required');
        el.dataset.required = 'false';
    }
    // Clear any premature validation error without firing a change event
    el.dataset.touched = 'false';
    if (typeof window['clearSelectError_' + id] === 'function') window['clearSelectError_' + id]();
    else if (typeof window['clearInputError_' + id] === 'function') window['clearInputError_' + id]();
}

function _handleFlowTypeUI(flow) {
    const sb = document.getElementById("banco");
    const sm = document.getElementById("moneda");
    const approvals_select = document.getElementById("approvals_select");
    switch (flow.ctipo_flujo) {
        case 0:
            sb.innerHTML = '';
            sb.dataset.touched = 'false';
            if (typeof window['clearSelectError_banco'] === 'function') window['clearSelectError_banco']();
            _syncRequired('beneficiario', false);
            _syncRequired('monto', false);
            document.getElementById("paymnet_div").setAttribute("Class", "row Not");
            document.getElementById("signature_div").setAttribute("Class", "row");
            document.getElementById("remittanceContainer").setAttribute("Class", "Not");
            break;
        case 1:
            document.getElementById("remittanceContainer").setAttribute("Class", "Not");
            if (approvals_select.value == 90) {
                document.getElementById("paymnet_div").setAttribute("Class", "Not");
                OldID = Number(urlParams.get('OldID'));
                document.getElementById("OldID").value = OldID;
            }
            if (approvals_select.value != 90) {
                document.getElementById("paymnet_div").setAttribute("Class", "Not");
                document.getElementById("signature_div").setAttribute("Class", "row");
                fill_bancos();
            }
            if (approvals_select.value == 90) {
                _syncRequired('moneda', false);
                _syncRequired('monto', false);
                _syncRequired('beneficiario', false);
                _syncRequired('remittance', true);
                _syncRequired('remitanceAmount', true);
            } else {
                _syncRequired('moneda', true);
                _syncRequired('monto', true);
                _syncRequired('beneficiario', true);
                _syncRequired('remittance', false);
                _syncRequired('remitanceAmount', false);
            }
            break;
        case 2:
            document.getElementById("remittanceContainer").setAttribute("Class", "Not");
            _syncRequired('moneda', true);
            _syncRequired('monto', true);
            _syncRequired('beneficiario', true);
            _syncRequired('remittance', false);
            _syncRequired('remitanceAmount', false);
            sm.innerHTML = '';
            sb.innerHTML = '';
            var option = document.createElement("option");
            option.value = "N/A"; option.innerHTML = "N/A"; sb.appendChild(option);
            sb.value = 'N/A';
            sb.dispatchEvent(new Event('change'));
            sb.dataset.touched = 'false';
            if (typeof window['clearSelectError_banco'] === 'function') window['clearSelectError_banco']();
            $.ajax({
                url: '/api_get_monedas',
                data: JSON.stringify({}),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    fill_select_moneda(result.result.recordset);
                }
            });
            _syncRequired('beneficiario', true);
            _syncRequired('monto', true);
            document.getElementById("paymnet_div").setAttribute("Class", "row");
            break;
        case 3:
            document.getElementById("remittanceContainer").setAttribute("Class", "row");
            _syncRequired('beneficiario', true);
            _syncRequired('monto', true);
            document.getElementById("paymnet_div").setAttribute("Class", "row Not");
            break;
        default:
            while (sb.firstChild) sb.removeChild(sb.firstChild);
            _syncRequired('beneficiario', false);
            _syncRequired('monto', false);
            document.getElementById("paymnet_div").setAttribute("Class", "row Not");
            document.getElementById("signature_div").setAttribute("Class", "Not");
            break;
    }
    // Always wipe any premature red state on payment fields after a flow change
    ['moneda', 'monto', 'banco'].forEach(function(id) {
        var fe = document.getElementById(id);
        if (!fe) return;
        fe.dataset.touched = 'false';
        if (typeof window['clearSelectError_' + id] === 'function') window['clearSelectError_' + id]();
        else if (typeof window['clearInputError_' + id] === 'function') window['clearInputError_' + id]();
    });
}

function fill_procesos() {
    if (!_formContextData) return;
    const s = document.getElementById("proceso");
    const sb = document.getElementById("banco");
    const cflow = document.getElementById('approvals_select').value;

    const flow = _getSelectedFlow();
    if (!flow) return;

    // Populate processes from cached xprocesos
    while (s.firstChild) s.removeChild(s.firstChild);
    while (sb.firstChild) sb.removeChild(sb.firstChild);

    const lengthProcesses = flow.xprocesos.split(';');
    if (lengthProcesses.length > 1) {
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.disabled = true;
        defaultOption.selected = true;
        defaultOption.innerHTML = "Select";
        s.appendChild(defaultOption);
    }
    for (let e = 0; e < lengthProcesses.length; e++) {
        const o = document.createElement("option");
        o.innerHTML = lengthProcesses[e];
        o.value = lengthProcesses[e];
        s.appendChild(o);
    }
    document.getElementById("ctipo").value = flow.ctipo_flujo;
    s.removeAttribute("disabled");
    if (s.options.length > 0) s.dispatchEvent(new Event('change'));

    // Render actors from cache
    const procesos = _resolveActors(flow);
    _populateActorSelects(procesos);

    // Handle flow type UI (payments, signature, etc.)
    _handleFlowTypeUI(flow);

    // Toggle cost center section based on flow type
    if (typeof toggleCostCenterSection === 'function') toggleCostCenterSection();

    document.getElementById("estado").value = crear_estado();
}
function fill_selects(post, select) {
    $.ajax({
        url: '/' + post,
        data: JSON.stringify({}),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                sel = document.getElementById(select)
                options = response.options
                for (let index = 0; index < options.length; index++) {
                    option = document.createElement("option")
                    option.value = options[index].id
                    option.innerHTML = options[index].xnombre
                    sel.appendChild(option)
                }
                sel.setAttribute('onchange', 'fill_selects_dependence("tools_get_departamentos", "departamentos","' + select + '")')
                fill_selects_dependence("tools_get_departamentos", 'departamentos', select)
            } else {
                launch_toast("Error loading " + select, 2)
            }
        }
    })
}

function fill_selects_dependence(post, select, dependence) {
    temp = document.getElementById(select)
    while (temp.firstChild) {
        temp.removeChild(temp.firstChild);
    }
    dependence = document.getElementById(dependence).value
    $.ajax({
        url: '/' + post,
        data: JSON.stringify({ dependence }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                sel = document.getElementById(select)
                options = response.options
                for (let index = 0; index < options.length; index++) {
                    option = document.createElement("option")
                    option.value = options[index].id
                    option.innerHTML = options[index].xnombre
                    sel.appendChild(option)
                }
            } else {
                launch_toast("Error loading " + select, 2)
            }
        }
    })
}
function approvals_management_resume() {
    $.ajax({
        url: '/approvals_management_resume',
        data: JSON.stringify({
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                resume = response.resume
                total = 0
                for (let index = 0; index < resume.length; index++) {
                    total += resume[index].num
                }
                for (let index = 0; index < resume.length; index++) {
                    divgroup = document.createElement("div")
                    divgroup.classList = "dept-row"
                    if (index >= 14) divgroup.classList = "dept-row dept-extra-row"

                    label = document.createElement("span")
                    label.classList = "dept-name"
                    label.title = resume[index].departamento
                    label.innerHTML = resume[index].departamento

                    const temp = (resume[index].num / total) * 100;
                                    
                    divbar = document.createElement("div")
                    divbar.classList = "dept-bar"
                    divbarfill = document.createElement("div")
                    divbarfill.classList = "dept-bar-fill"
                    divbarfill.style.width = (temp + temp) + "%";
                    divbar.appendChild(divbarfill)

                    span = document.createElement("span")
                    span.classList = "dept-count"
                    span.innerHTML = resume[index].num

                    divgroup.appendChild(label)
                    divgroup.appendChild(divbar)
                    divgroup.appendChild(span)
                    resumediv.appendChild(divgroup)
                }
                if (resume.length > 12) {
                    var btnWrap = document.createElement("div")
                    btnWrap.style = "text-align:center; padding-top:8px;"
                    var btn = document.createElement("button")
                    btn.id = "deptShowMoreBtn"
                    btn.className = "btn btn-link btn-sm"
                    btn.style = "color:#00586f; font-size:0.78rem; text-decoration:none;"
                    btn.innerHTML = '<i id="deptShowMoreIcon" class="fas fa-chevron-down me-1"></i><span id="deptShowMoreText">Show ' + (resume.length - 12) + ' more</span>'
                    btn.onclick = function() {
                        var extras = document.querySelectorAll('.dept-extra-row')
                        var icon = document.getElementById('deptShowMoreIcon')
                        var text = document.getElementById('deptShowMoreText')
                        var hidden = extras[0].style.display === 'none' || extras[0].style.display === ''
                        extras.forEach(function(r) { r.style.display = hidden ? 'flex' : 'none' })
                        icon.className = hidden ? 'fas fa-chevron-up me-1' : 'fas fa-chevron-down me-1'
                        text.textContent = hidden ? 'Show less' : 'Show ' + extras.length + ' more'
                    }
                    btnWrap.appendChild(btn)
                    resumediv.appendChild(btnWrap)
                }
            } else {
                launch_toast("Error loading " + select, 2)
            }
        }
    })
}
function get_crm_pending(UserId) {
    $.ajax({
        url: '/crm_get_pending',
        data: JSON.stringify({
            UserId
        }),
        type: 'GET',
        contentType: 'application/json',
        success: function (response) {
            if (response.result == 1) {
                document.getElementById("crm_pending").innerHTML = response.crm_pending.recordset.length
            }
        }
    })
}

$(document).ready(function () {
    let titulo = document.title
    UserID = urlParams.get('p')
    if (titulo == "Dashboard | Active Re") {
        get_approval_pending(UserID, titulo)
        try {
            if (resumediv) {
                approvals_management_resume()
            }
        } catch (error) { }
        get_crm_pending(UsuarioID.value)
    }
    if (titulo == "Approvals Pending | Active Re") {
        get_approval_pending(UserID, titulo)
    }
    if (titulo == "Approvals Approved | Active Re") {
        get_approval_pending(UserID, titulo)
    }
    if (titulo == "Approvals Rejected | Active Re") {
        get_approval_pending(UserID, titulo)
    }
    if (titulo == "Approvals in Progress | Active Re") {
        get_approval_pending(UserID, titulo)
    }
    if (titulo == "Approval Details | Active Re") {
        try {
            ArchivosApproval()
        } catch { }
        get_usuarios_by_manager("uasignar", UserID)
        // error_id = Number(document.getElementById("okForm").value)
        // if (error_id > -1) {
        //     launch_toast(document.getElementById("mensaje").value, error_id)
        // }        
        var RowID = localStorage.getItem("new_item");
        var error = localStorage.getItem("error");
        if (error == "error1") {
            launch_toast("Error assigning Approval " + RowID, 1)
        }
        localStorage.setItem("new_item", null);
        localStorage.setItem("error", null);
        RowID = document.getElementById("ID").value
        get_approval_asignado(RowID)
    }
    if (titulo == "Contacts | Active Re") {
        const checkboxes = document.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(function (checkbox) {
            checkbox.addEventListener('click', function () {
                if ((ObtenerCheckboxSeleccionados()).length > 0) {
                    document.getElementById("delete_rows").classList.remove("Not")
                } else {
                    document.getElementById("delete_rows").classList.add("Not")
                }
            });
        });
    }
    if (titulo.includes("Form")) {
        try {
            valor = Number(document.getElementById("okForm").value)
            mensaje = document.getElementById("mensaje").value
            launch_toast(mensaje, valor)
        } catch (error) { }
    }
    $("#CopiarArchivosAuditoria").click(function (e) {
        id = document.getElementById("ID").value
        url = location.search.split("&");
        db = 'live'
        for (var i = 0; i < url.length; i++) {
            params = url[i].split('=');
            if (params[0] == 'dbdevteam') {
                db = params[1]
            }
        }
        $.ajax({
            url: '/CopiarArchivosAuditoria',
            data: JSON.stringify({
                id: id,

            }),
            type: 'POST',
            contentType: 'application/json',
            success: function (result) {
                window.open('sir://' + result.ruta_final, "_parent");
            }
        })
    })
    $("#DivAgregarArchivos").click(function (e) {
        e.preventDefault();
        e.stopPropagation();
        id = document.getElementById("ID").value;
        url = location.search.split("&");
        db = 'live';
        for (var i = 0; i < url.length; i++) {
            params = url[i].split('=');
            if (params[0] == 'dbdevteam') {
                db = params[1];
            }
        }
        $.ajax({
            url: '/get_files_by_avisos',
            data: JSON.stringify({
                id: id,
            }),
            type: 'POST',
            contentType: 'application/json',
            success: function (result) {
                document.getElementById("AgregarArchivos").classList.toggle('Not');
                select = document.getElementById("SelectArchivosPendientes");
                for (let e = 0; e < result.pendientes.length; e++) {
                    temp = result.pendientes[e].split('~');
                    option = document.createElement("option");
                    option.setAttribute("value", result.pendientes[e]);
                    option.innerHTML = temp[0] + " - " + temp[1];
                    select.appendChild(option);
                }
            }
        });
    });
    
    $("#ArchivosAddtbtn").click(function (e) {
        id = document.getElementById("ID").value
        departamento = document.getElementById("departamento").value
        select = document.getElementById("SelectArchivosPendientes").value.split('~')
        tipo = 0
        if (departamento == "Claims") {
            tipo = 1
        }
        AddFile(id, departamento, select[0], select[1], tipo)
    })
    $("#ArchivosCancelbtn").click(function (e) {
        document.getElementById("AgregarArchivos").classList.toggle('Not');
    })
    $("#delete_rows").click(function (e) {
        id = ObtenerCheckboxSeleccionados()
        mercadeo_delete_contactos(id)
    })
    $("#restore_rows").click(function (e) {
        restaurar_contactos_eliminados()
    })
    // Pedido de pagos
    // Botón de accion en approval detalle
    $("#ApprovalActionbtn").click(function (e) {
        e.preventDefault();

        let valid = true;

        const accionEl = document.getElementById('AccionFinal');
        if (!accionEl || !accionEl.value) {
            valid = false;
            if (typeof window['setSelectError_AccionFinal'] === 'function') {
                window['setSelectError_AccionFinal']('Result is required');
            }
            launch_toast('Please select a result', 2);
        } else if (typeof window['clearSelectError_AccionFinal'] === 'function') {
            window['clearSelectError_AccionFinal']();
        }

        const comentEl = document.getElementById('comentario');
        if (!comentEl || !comentEl.value.trim()) {
            valid = false;
            if (typeof window['setInputError_comentario'] === 'function') {
                window['setInputError_comentario']('Comment is required');
            }
            launch_toast('A comment is required', 2);
        } else if (typeof window['clearInputError_comentario'] === 'function') {
            window['clearInputError_comentario']();
        }

        if (!valid) return;

        if (comentEl.value[0] === ' ') {
            launch_toast('The comment should not start with a space', 2);
            return;
        }

        if (accionEl.value === 'Executed' &&
            document.getElementById('estado1').value === 'Executed') {
            if (document.getElementById('PaymentSupportfiles').files.length === 0) {
                launch_toast('The proof of payment is required', 2);
                return;
            }
        }

        const btn = window['submitBtn_ApprovalActionbtn'];
        if (btn) btn.setSending();

        var data = new FormData(document.getElementById('FormApprovalsDetalle'));
        $.ajax({
            type: 'POST',
            url: '/approvals_detalle_accion',
            data: data,
            enctype: 'multipart/form-data',
            processData: false,
            contentType: false,
            dataType: 'json',
            success: function (response) {
                let RowID = Number(response.RowID);
                if (response.result > 0) {
                    if (btn) btn.setDone();
                    localStorage.setItem('new_item', RowID);
                    update_approval_asignado(RowID, accionEl.value);
                    approval_detalle(RowID, 1, 'Action successfully registered for ' + RowID + '.');
                } else {
                    if (btn) btn.setError();
                    launch_toast('Error creating request.', 2);
                }
            },
            error: function(xhr, status, error) {
                if (btn) btn.setError();
                if (xhr.getResponseHeader('content-type').includes('text/html')) {
                    document.open();
                    document.write(xhr.responseText);
                    document.close();
                } else {
                    launch_toast('Error creating request: ' + error, 2);
                }
            }
        });
    });
    
    if (titulo.includes("Request Form")) {
        // 
        //Formulario de forms_interdepartmental_request
        //campos obligatorios en Request Form
        // 
        // $("#approvals_select, #description, #beneficiario, #monto").change(function(e) {
        //     if (this.value == '' || this.value <= 0) {
        //         this.setAttribute("invalid", "")
        //     }
        // }) 
        $("#nombre").change(function (e) {
            if (this.value == "Signature of Documents") {
                document.getElementById("banco").setAttribute("disabled", "")
                document.getElementById("moneda").setAttribute("disabled", "")
                document.getElementById("monto").setAttribute("disabled", "")
            } else {
                document.getElementById("banco").setAttribute("required", "")
                document.getElementById("moneda").setAttribute("required", "")
                document.getElementById("monto").setAttribute("required", "")
                document.getElementById("banco").removeAttribute("disabled")
                document.getElementById("moneda").removeAttribute("disabled")
                document.getElementById("monto").removeAttribute("disabled")
            }
        })
        fill_companias(document.getElementById("ccompania").value)
        RowID = Number(urlParams.get('RowID'))

        //Si hay un pedido de pago
        if (RowID) {
            $.ajax({
                url: '/get_log',
                data: JSON.stringify({
                    id: RowID,
                }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (result.result == 0) {
                        launch_toast("Error loading Approvals", 2)
                    } else {
                        if(result.procesos.remittance){
                        document.getElementById("remittance").value = result.procesos.remittance
                        document.getElementById("monto").value = result.procesos.mmonto
                        if(result.procesos.cflow == 89 && result.procesos.cflow == 99){
                            document.getElementById("proceso").value = "90"
                        } 
                        }
                        var descEl = document.getElementById("description");
                        descEl.innerHTML = result.procesos.detalle_proceso || '';
                        descEl.dispatchEvent(new Event('input'));
                        document.getElementById("monto").value = result.procesos.mmonto
                        // Preseleccionar beneficiario una vez que las opciones se carguen desde el componente dinámico
                        try {
                            if (window.handleBankBeneficiary && result.procesos.beneficiario) {
                                // Llama sin query y pasando el ID/valor del beneficiario
                                window.handleBankBeneficiary('', result.procesos.beneficiario);
                            } else {
                                // Fallback: asignación directa por si ya existiera la opción (menos fiable)
                                document.getElementById("beneficiario").value = result.procesos.beneficiario;
                            }
                        } catch (e) { console.warn('Beneficiary preselect failed:', e); }
                    
                }
                }
            })
            ArchivosApproval(RowID)
        }

        $("#compania").change(function (e) {
            fill_flows()
        })
        $("#banco").change(function (e) {
            var bancoVal = this.value
            if (bancoVal === 'N/A' || bancoVal === '') {
                var monedaEl = document.getElementById('moneda')
                if (monedaEl) {
                    monedaEl.innerHTML = ''
                    var op = document.createElement('option')
                    op.value = 'USD'; op.text = 'USD'
                    monedaEl.appendChild(op)
                    monedaEl.value = 'USD'
                }
                return
            }
            ctipo = document.getElementById("ctipo").value
            if (ctipo == 1) {
                fill_moneda()
                fill_actores()
            } else {
                fill_select_moneda()
            }
        })
        $("#moneda").change(function (e) {
            ctipo_flujo = document.getElementById("ctipo").value
            if (ctipo_flujo != 1) {
                if (moneda.value == 'MULTI') {
                    document.getElementById("monto").value = null
                }
            }
            if (ctipo_flujo == 1) {
                fill_actores()
            }
        })
        $("#submitApproval").click(function(e) {
            e.preventDefault();
            const _btn = window['submitBtn_submitApproval'];

            // Ensure beneficiario hidden input is synced before validation
            const beneficiarioSelect = document.getElementById("beneficiario");
            const beneficiarioHidden = document.getElementById("beneficiario_hidden");
            if(beneficiarioSelect && beneficiarioHidden && beneficiarioSelect.value){
                beneficiarioHidden.value = beneficiarioSelect.value;
            }

            // Ensure visible actor selectors are reflected in hidden submit fields.
            if (typeof syncVisibleActorSelectorsToHidden === 'function') {
                syncVisibleActorSelectorsToHidden();
            }

            OldRowID = urlParams.get('RowID');
            const process = document.getElementById("proceso");
            const ctipo = document.getElementById("ctipo")?.value;

            // Helper: trigger floating mixin error state for any field type
            function markFieldError(id) {
                const el = document.getElementById(id);
                if (!el) return;
                el.dataset.touched = 'true';
                // Use unconditional setters first — they bypass data-touched / data-required guards
                if (typeof window['setSelectError_' + id] === 'function') {
                    window['setSelectError_' + id]();
                } else if (typeof window['setInputError_' + id] === 'function') {
                    window['setInputError_' + id]();
                } else if (typeof window['validateSelect_' + id] === 'function') {
                    window['validateSelect_' + id]();
                } else if (typeof window['validateInput_' + id] === 'function') {
                    window['validateInput_' + id]();
                } else {
                    el.setAttribute("invalid", "");
                }
            }

            // ── Validate ALL fields before touching button state ──────────────
            let send = true;

            // Proceso
            if (!process || process.value == undefined || process.value == '') {
                send = false;
                markFieldError("proceso");
            }

            // Required text/select fields
            ["approvals_select", "description"].forEach(function(id) {
                const el = document.getElementById(id);
                if (!el || el.value === '' || el.value === '-----') {
                    send = false;
                    markFieldError(id);
                }
            });

            // Payment fields when ctipo == 1 and not remittance flow
            if (ctipo == 1 && process && !process.value.includes('Posted Remittance')) {
                ["beneficiario_hidden", "banco", "moneda", "monto"].forEach(function(id) {
                    const el = document.getElementById(id);
                    if (!el || el.value === '') {
                        send = false;
                        markFieldError(id);
                    }
                });
            }


            // Categorization items: if any row exists, all 3 fields must be filled
            const costSection = document.getElementById('costCenterSection');
            if (costSection && !costSection.classList.contains('Not')) {
                const costRows = document.querySelectorAll('#costItemsBody tr');
                if (costRows.length > 0) {
                    let costValid = true;
                    costRows.forEach(function(row) {
                        const code = row.querySelector('.cost-item-code');
                        const name = row.querySelector('.cost-item-name');
                        const amount = row.querySelector('.cost-item-amount');
                        if (!code || !code.value || !name || !name.value.trim() || !amount || !amount.value) {
                            costValid = false;
                            if (code && !code.value) code.style.borderBottom = '2px solid #dc3545';
                            if (name && !name.value.trim()) name.style.borderBottom = '2px solid #dc3545';
                            if (amount && !amount.value) amount.style.borderBottom = '2px solid #dc3545';
                        }
                    });
                    if (!costValid) {
                        send = false;
                        launch_toast("Categorization items: all fields are required", 2);
                    }
                }
            }

            // Confirmation checkbox
            const summitCheck = document.getElementById("SummitCheck");
            if (summitCheck && !summitCheck.checked) {
                send = false;
                summitCheck.setAttribute("invalid", "");
            } else if (summitCheck) {
                summitCheck.removeAttribute("invalid");
            }

            if (!send) {
                launch_toast("Error, required fields are empty", 2);
                return;
            }

            // ── All valid — proceed to send ──────────────────────────────────
            if (_btn) _btn.setSending();

            if (ctipo == 2) {
                const signingFiles = typeof window['getFiles_Signingfiles'] === 'function'
                    ? window['getFiles_Signingfiles']()
                    : [];
                if (!signingFiles || signingFiles.length === 0) {
                    launch_toast("At least 1 file must be added", 2);
                    if (_btn) _btn.reset();
                    return;
                }
            }

            // Sync cost center items before submit
            if (typeof syncApprovalItemsInput === 'function') syncApprovalItemsInput();

            var data = new FormData(document.getElementById("form_interdepartmental_request"));
            $.ajax({
                type: "POST",
                url: '/forms_interdepartmental_request',
                data: data,
                enctype: 'multipart/form-data',
                processData: false,
                contentType: false,
                dataType: "json",
                success: function(response) {
                    RowID = Number(response.RowID);
                    if (RowID > 0) {
                        localStorage.setItem("new_item", RowID);
                        if (OldRowID) {
                            cflow = document.getElementById("approvals_select").value;
                            copy_files_approvals(RowID, OldRowID, cflow);
                            agregar_approval_asignado(RowID, OldRowID, response.estado);
                        }
                        setTimeout(() => {
                            approval_detalle(RowID, 1, "Approval " + RowID + " successfully created.");
                        }, 500);
                    } else {
                        if (response.error !== undefined) {
                            launch_toast(response.error.substring(0, 60), 2);
                        } else {
                            launch_toast("Error creating request.", 2);
                        }
                    }
                    if (_btn) _btn.setDone();
                },
                error: function(xhr, status, error) {
                    const contentType = xhr.getResponseHeader("content-type");
                    if (contentType && contentType.includes("text/html")) {
                        document.open();
                        document.write(xhr.responseText);
                        document.close();
                    } else {
                        launch_toast("Error creating request: " + error, 2);
                    }
                    if (_btn) _btn.setError();
                },
                beforeSend: function() {}
            });
        });
    }
    if (titulo.includes("Performance Review Delivery")) {

        $("#nombre").change(function (e) {
            if (this.value == "Signature of Documents") {
                document.getElementById("banco").setAttribute("disabled", "")
                document.getElementById("moneda").setAttribute("disabled", "")
                document.getElementById("monto").setAttribute("disabled", "")
            } else {
                document.getElementById("banco").setAttribute("required", "")
                document.getElementById("moneda").setAttribute("required", "")
                document.getElementById("monto").setAttribute("required", "")
                document.getElementById("banco").removeAttribute("disabled")
                document.getElementById("moneda").removeAttribute("disabled")
                document.getElementById("monto").removeAttribute("disabled")
            }
        })
        fill_companias(document.getElementById("ccompania").value)
        RowID = Number(urlParams.get('RowID'))
        //Si hay un pedido de pago
        if (RowID) {
            $.ajax({
                url: '/get_log',
                data: JSON.stringify({
                    id: RowID,
                }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (result.result == 0) {
                        launch_toast("Error loading Approvals", 2)
                    } else {
                        var descEl = document.getElementById("description");
                        descEl.innerHTML = result.procesos.detalle_proceso || '';
                        descEl.dispatchEvent(new Event('input'));
                    }
                }
            })
            ArchivosApproval(RowID)
        }

        $("#compania").change(function (e) {
            fill_flows()
        })
        $("#banco").change(function (e) {
            var bancoVal = this.value
            if (bancoVal === 'N/A' || bancoVal === '') {
                var monedaEl = document.getElementById('moneda')
                if (monedaEl) {
                    monedaEl.innerHTML = ''
                    var op = document.createElement('option')
                    op.value = 'USD'; op.text = 'USD'
                    monedaEl.appendChild(op)
                    monedaEl.value = 'USD'
                }
                return
            }
            ctipo = document.getElementById("ctipo").value
            if (ctipo == 1) {
                fill_moneda()
                fill_actores()
            } else {
                fill_select_moneda()
            }
        })
        $("#moneda").change(function (e) {
            ctipo_flujo = document.getElementById("ctipo").value
            if (ctipo_flujo != 1) {
                if (moneda.value == 'MULTI') {
                    document.getElementById("monto").setAttribute("disabled", "")
                    document.getElementById("monto").value = null
                } else {
                    document.getElementById("monto").removeAttribute("disabled")
                }
            }
            if (ctipo_flujo == 1) {
                fill_actores()
            }
        })
        $("#submitPerformanceRequest").click(function (e) {
            e.preventDefault();

            var requiredFields = [
                { id: 'observationsLeader',   label: 'General Observation leader'      },
                { id: 'observationsAssociate', label: 'General observations associate' },
                { id: 'generalResult',         label: 'General Result'                 }
            ];

            var valid = true;
            requiredFields.forEach(function(f) {
                var el = document.getElementById(f.id);
                if (!el) return;
                var errEl = document.querySelector('[data-error-for="' + f.id + '"]');
                el.classList.remove('valid', 'error');
                if (errEl) errEl.classList.remove('show');
                if (!el.value.trim()) {
                    el.classList.add('error');
                    if (errEl) { errEl.textContent = f.label + ' is required'; errEl.classList.add('show'); }
                    valid = false;
                } else {
                    el.classList.add('valid');
                }
            });

            // Validate file upload (Signingfiles is required)
            var fileInput = document.getElementById('Signingfiles');
            var fileList  = document.getElementById('filelist-Signingfiles');
            var fileErrEl = document.querySelector('[data-error-for="Signingfiles"]');
            var fileCount = fileList ? fileList.getElementsByClassName('file-item').length : 0;
            if (fileErrEl) fileErrEl.classList.remove('show');
            if (fileCount === 0) {
                if (fileErrEl) { fileErrEl.textContent = 'Upload Evaluation Form is required'; fileErrEl.classList.add('show'); }
                valid = false;
            }

            var approvalsEl = document.getElementById('approvals_select');
            if (!approvalsEl || !approvalsEl.value) {
                launch_toast('The form is still loading, please try again in a moment.', 2);
                return;
            }

            if (!valid) {
                launch_toast('Please fill in all required fields before submitting.', 2);
                return;
            }

            var ctrl = window['submitBtn_submitPerformanceRequest'];
            if (ctrl) ctrl.setSending();
            document.getElementById('form_hr_performance_review').submit();
        });


    }
    if (titulo.includes("Personnel Requisition Form")) {

        $("#nombre").change(function (e) {
            if (this.value == "Signature of Documents") {
                document.getElementById("banco").setAttribute("disabled", "")
                document.getElementById("moneda").setAttribute("disabled", "")
                document.getElementById("monto").setAttribute("disabled", "")
            } else {
                document.getElementById("banco").setAttribute("required", "")
                document.getElementById("moneda").setAttribute("required", "")
                document.getElementById("monto").setAttribute("required", "")
                document.getElementById("banco").removeAttribute("disabled")
                document.getElementById("moneda").removeAttribute("disabled")
                document.getElementById("monto").removeAttribute("disabled")
            }
        })
        fill_companias(document.getElementById("ccompania").value)
        RowID = Number(urlParams.get('RowID'))
        //Si hay un pedido de pago
        if (RowID) {
            $.ajax({
                url: '/get_log',
                data: JSON.stringify({
                    id: RowID,
                }),
                type: 'POST',
                contentType: 'application/json',
                success: function (result) {
                    if (result.result == 0) {
                        launch_toast("Error loading Approvals", 2)
                    } else {
                        var descEl = document.getElementById("description");
                        descEl.innerHTML = result.procesos.detalle_proceso || '';
                        descEl.dispatchEvent(new Event('input'));
                    }
                }
            })
            ArchivosApproval(RowID)
        }

        $("#compania").change(function (e) {
            fill_flows()
        })
        $("#banco").change(function (e) {
            var bancoVal = this.value
            if (bancoVal === 'N/A' || bancoVal === '') {
                var monedaEl = document.getElementById('moneda')
                if (monedaEl) {
                    monedaEl.innerHTML = ''
                    var op = document.createElement('option')
                    op.value = 'USD'; op.text = 'USD'
                    monedaEl.appendChild(op)
                    monedaEl.value = 'USD'
                }
                return
            }
            ctipo = document.getElementById("ctipo").value
            if (ctipo == 1) {
                fill_moneda()
                fill_actores()
            } else {
                fill_select_moneda()
            }
        })
        $("#moneda").change(function (e) {
            ctipo_flujo = document.getElementById("ctipo").value
            if (ctipo_flujo != 1) {
                if (moneda.value == 'MULTI') {
                    document.getElementById("monto").value = null
                }
            }
            if (ctipo_flujo == 1) {
                fill_actores()
            }
        })
    }
    $("#asignacionusuarios").click(function (e) {
        ShowHideDiv("ApprovalAsignacion")
        // document.getElementById("ApprovalAction").setAttribute("class", "Not")
    })
    $("#Asignarbtn").click(function (e) {
        e.preventDefault();

        let valid = true;

        const uasignarEl = document.getElementById('uasignar');
        if (!uasignarEl || !uasignarEl.value) {
            valid = false;
            if (typeof window['setSelectError_uasignar'] === 'function') {
                window['setSelectError_uasignar']('Please select a collaborator');
            }
            launch_toast('Please select a collaborator to assign', 2);
        } else if (typeof window['clearSelectError_uasignar'] === 'function') {
            window['clearSelectError_uasignar']();
        }

        const comentAsignarEl = document.getElementById('comentario_asignar');
        if (!comentAsignarEl || !comentAsignarEl.value.trim()) {
            valid = false;
            if (typeof window['setInputError_comentario_asignar'] === 'function') {
                window['setInputError_comentario_asignar']('Comment is required');
            }
            launch_toast('A comment is required', 2);
        } else if (typeof window['clearInputError_comentario_asignar'] === 'function') {
            window['clearInputError_comentario_asignar']();
        }

        if (!valid) return;

        const btn = window['submitBtn_Asignarbtn'];
        if (btn) btn.setSending();

        const RowID = document.getElementById('ID').value;
        const assignedUser = uasignarEl.value;
        const assignedComment = comentAsignarEl.value.trim();
        var data = new FormData(document.getElementById('FormAsignacion'));
        $.ajax({
            type: 'POST',
            url: '/approval_asignar_usuario',
            data: data,
            enctype: 'multipart/form-data',
            processData: false,
            contentType: false,
            dataType: 'json',
            success: function (response) {
                if (response.result == 1) {
                    if (btn) btn.setDone();

                    // Close the assignment panel
                    const panel = document.getElementById('ApprovalAsignacion');
                    if (panel) panel.classList.add('Not');

                    // Hide the assign trigger button — already assigned
                    // const assignTrigger = document.getElementById('asignacionusuarios');
                    // if (assignTrigger) assignTrigger.style.display = 'none';

                    // Update executor status block in-place
                    const asignadoLine = document.getElementById('executor-asignado-line');
                    if (asignadoLine) {
                        const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
                        asignadoLine.textContent = 'Assigned to ' + assignedUser + ' on ' + today + '.';
                        asignadoLine.style.display = 'block';
                    }
                    const comentLine = document.getElementById('executor-asignador-comentarios-line');
                    if (comentLine && assignedComment) {
                        comentLine.textContent = 'Comments: ' + assignedComment;
                        comentLine.style.display = 'block';
                    }

                    // Reset form and button after a moment
                    setTimeout(function() {
                        if (btn) btn.reset();
                        document.getElementById('FormAsignacion').reset();
                        if (typeof window['clearSelectError_uasignar'] === 'function') window['clearSelectError_uasignar']();
                        if (typeof window['clearInputError_comentario_asignar'] === 'function') window['clearInputError_comentario_asignar']();
                    }, 1500);

                    launch_toast('Approval ' + RowID + ' successfully assigned to ' + assignedUser + '.', 1);
                    localStorage.setItem('new_item', RowID);
                } else {
                    if (btn) btn.setError();
                    launch_toast('Error assigning Approval ' + RowID, 2);
                }
            },
            error: function() {
                if (btn) btn.setError();
                launch_toast('Error assigning Approval ' + RowID, 2);
            }
        });
    })
    $("#approvals_select").change(function (e) {
        s = document.getElementById("proceso")
        sb = document.getElementById("banco")
        sm = document.getElementById("moneda")
        id = document.getElementById('approvals_select').value
        if (this.value == '') {
            s.setAttribute("disabled", "")
            while (s.firstChild) {
                s.removeChild(s.firstChild);
            }
            sb.innerHTML = '';
            sm.innerHTML = '';
            document.getElementById("ctipo").value = ''
            for (i = 1; i < actores.length; i++) {
                sa = document.getElementById(actores[i])
                while (sa.firstChild) {
                    sa.removeChild(sa.firstChild);
                }
            }
            document.getElementById("paymnet_div").setAttribute("Class", "row Not");
            document.getElementById("signature_div").setAttribute("Class", "row Not");
        } else {
            fill_procesos()
        }
    })
    $("#updatePerformanceRequest").click(function (e) {
        document.getElementById('performance_review_details').addEventListener('submit', function (event) {
            event.preventDefault();
            const url = window.location.href;
            const urlObj = new URL(url);
            const userId = urlObj.searchParams.get('p').p;
            let addUser = "";
            if (userId) {
                addUser = userId;
            }
            var data = new FormData(document.getElementById("performance_review_details"));
            const id = url.substring(url.lastIndexOf('/') + 1);
                $.ajax({
                    type: "PUT",
                    url: '/forms_hr_performance_review/' + id + addUser,
                    data: data,
                    enctype: 'multipart/form-data',
                    processData: false, // Indica a jQuery que no procese los datos
                    contentType: false, // Indica a jQuery que no establezca el contentType
                    dataType: "json",
                    success: function (response) {
                        if (response.result === 1) {
                            launch_toast("Performance Review updated successfully.", 1);
                        } else {
                            launch_toast("Error creating request.", 2);
                        }
                    },
                    beforeSend: function () {
                    }
                });

            })
    })
}) // end document ready


function setupDropzone(dropzoneId, fileInputId, fileListId, filesArray) {
    const dropzone = document.getElementById(dropzoneId);
    const fileInput = document.getElementById(fileInputId);
    const fileList = document.getElementById(fileListId);

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
        const files = Array.from(event.dataTransfer.files);
        handleFiles(files, fileList, filesArray, fileInput);
    });

    fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files);
        handleFiles(files, fileList, filesArray, fileInput);
    });

    function handleFiles(files, fileList, filesArray, fileInput) {
        filesArray.push(...files);
        updateFileList(filesArray, fileList);
        updateFileInput(filesArray, fileInput);
        return filesArray;  // Retornar el array actualizado
    }

    function updateFileList(filesArray, fileList) {
        fileList.innerHTML = '';

        filesArray.forEach((file) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.setAttribute('data-file-id', file.name);

            const fileIcon = document.createElement('img');
            fileIcon.src = '/icons/pdf.png'; 
            const fileName = document.createElement('span');
            fileName.textContent = file.name;

            const removeButton = document.createElement('button');
            removeButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon icon-tabler icons-tabler-outline icon-tabler-trash">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                    <path d="M4 7l16 0" />
                    <path d="M10 11l0 6" />
                    <path d="M14 11l0 6" />
                    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
                    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
                </svg>
                `;
                removeButton.addEventListener('click', () => {
                    const index = filesArray.indexOf(file);
                    if (index > -1) {
                        filesArray.splice(index, 1);  // Elimina el archivo directamente
                        updateFileList(filesArray, fileList); 
                        updateFileInput(filesArray, fileInput); 
                    }
                });

            fileItem.appendChild(fileIcon);
            fileItem.appendChild(fileName);
            fileItem.appendChild(removeButton);
            fileList.appendChild(fileItem);
        });
    }

    function updateFileInput(filesArray, fileInput) {
        const dataTransfer = new DataTransfer();

        filesArray.forEach(file => {
            dataTransfer.items.add(file);
        });

        fileInput.files = dataTransfer.files;
    }
}

// Confirmation flow for rejecting approvals
let _rejectModalInstance = null;
function openRejectConfirm(seleccion) {
    try {
        const input = document.getElementById('rejectSelection');
        if (input) input.value = seleccion || '';
        const modalEl = document.getElementById('rejectConfirmModal');
        if (modalEl && window.bootstrap && window.bootstrap.Modal) {
            // Create or reuse Bootstrap modal instance
            if (!_rejectModalInstance) {
                _rejectModalInstance = new window.bootstrap.Modal(modalEl);
            }
            _rejectModalInstance.show();
        } else {
            // Fallback to native confirm if Bootstrap modal is not available
            if (window.confirm('Do you really want to reject this approval?')) {
                ActionApproval('Rejected', seleccion);
            }
        }
    } catch (e) {
        // As last resort, proceed without modal
        ActionApproval('Rejected', seleccion);
    }
}

function confirmRejectProceed() {
    const input = document.getElementById('rejectSelection');
    const seleccion = input ? input.value : undefined;
    // Close modal if instance exists
    try {
        if (_rejectModalInstance) {
            _rejectModalInstance.hide();
        } else {
            const modalEl = document.getElementById('rejectConfirmModal');
            if (modalEl && window.bootstrap && window.bootstrap.Modal) {
                const instance = window.bootstrap.Modal.getInstance(modalEl) || new window.bootstrap.Modal(modalEl);
                instance.hide();
            }
        }
    } catch (e) { /* ignore */ }
    // Proceed to open the approval action sidebar prefilled with Rejected
    ActionApproval('Rejected', seleccion);
}