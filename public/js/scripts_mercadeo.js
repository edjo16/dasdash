function mercadeo_contact_action(form, action) {
    var data = new FormData(document.getElementById(form));
    $.ajax({
        type: "POST",
        url: '/' + form,
        data: data,
        enctype: 'multipart/form-data',
        processData: false, // tell jQuery not to process the data
        contentType: false, // tell jQuery not to set contentType
        dataType: "json",
        success: function(response) {
            RowID = Number(response.RowID)
            if (RowID > 0) {
                if (action == "new") {
                    localStorage.setItem("new_item", RowID);
                    mercadeo_update_contacto(RowID, 1, )
                }
                if (action == "update") { launch_toast("Contact successfully updated.", 1) }

            } else {
                launch_toast("Error executing request.", 2)
            }
        },
        beforeSend: function() {}
    });
}

function crm_main_change_user(id, user) {
    $.ajax({
        url: '/crm_change_user',
        data: JSON.stringify({
            id: id,
            user: user
        }),
        type: 'POST',
        contentType: 'application/json',
        success: function(result) {}
    })
}

function mercadeo_update_contacto(id, error_id = -1, mensaje = '') {
    var url_string = window.location.href;
    url_string = url_string.replace('RowID', 'OldID')
    var url = new URL(url_string);
    window.location.href = "/forms_mercadeo_update_contacto?" + url.searchParams + "&RowID=" + id;
};

$(document).ready(function() {
    titulo = document.title
    if (titulo == "BADACO - New Contact Form | Active Re") {
        $("#mercadeo_add_contact").click(function(e) {
            e.preventDefault()
            mercadeo_contact_action("form_mercadeo_nuevo_contacto", "new")
        })
    }
    if (titulo == "BADACO - Update Contact | Active Re") {
        $("#mercadeo_update_contact").click(function(e) {
            e.preventDefault()
            mercadeo_contact_action("form_mercadeo_update_contacto", "update")
        })
    }
    console.log("Document Ready Mercadeo.")
})