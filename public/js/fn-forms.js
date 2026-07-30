function get_beneficiario(departamento) {
    $.ajax({
        url: '/get_beneficiario',
        data: JSON.stringify({
            'departamento': departamento
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function(result) {
            s = document.getElementById("beneficiario_id");
            result.arraytest.forEach(element => {
                op = document.createElement("option")
                op.value = element.beneficiario_id
                op.innerHTML = element.nombre
                s.appendChild(op)
            });
        }
    })
}

function get_beneficiario_cuenta(v) {
    console.log(v.value)
    if (v.value > 0) {
        document.getElementById("icono_beneficiario_nuevo").setAttribute("class", "Not")
        document.getElementById("icono_beneficiario_edit").removeAttribute("class", "Not")
        document.getElementById("icono_beneficiario_edit").setAttribute("class", "fas fa-pen  clic")
        document.getElementById
    } else {
        document.getElementById("icono_beneficiario_edit").setAttribute("class", "Not")
        document.getElementById("icono_beneficiario_nuevo").removeAttribute("class", "Not")
        document.getElementById("icono_beneficiario_nuevo").setAttribute("class", "fas fa-plus  clic")
        document.getElementById
    }
    $.ajax({
        url: '/get_beneficiario_cuenta',
        data: JSON.stringify({
            'id': v.value
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function(result) {
            s = document.getElementById("beneficiario_cuenta_id");
            result.arraytest.forEach(element => {
                op = document.createElement("option")
                op.value = element.beneficiario_id
                op.innerHTML = element.banco + " - " + element.cuenta_bancaria
                s.appendChild(op)
            });
        }
    })
}