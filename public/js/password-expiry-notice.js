(function () {
    var WARNING_THRESHOLD_DAYS = 10;
    var STORAGE_PREFIX = 'pwd-expiry-modal-seen';

    function getUserId() {
        var userInput = document.getElementById('UsuarioID');
        return userInput && userInput.value ? userInput.value : '';
    }

    function getTodayLocal() {
        var d = new Date();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mm + '-' + dd;
    }

    function getSeenKey(userID) {
        return STORAGE_PREFIX + ':' + userID;
    }

    function wasSeenToday(userID) {
        return localStorage.getItem(getSeenKey(userID)) === getTodayLocal();
    }

    function markSeenToday(userID) {
        localStorage.setItem(getSeenKey(userID), getTodayLocal());
    }

    function showToast(message, type) {
        if (typeof window.launch_toast === 'function') {
            window.launch_toast(message, type || 1);
            return;
        }
        window.alert(message);
    }

    function removeModal() {
        var existing = document.getElementById('password-expiry-modal');
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
    }

    function renderPasswordModal(daysRemaining, options) {
        options = options || {};

        removeModal();

        var modal = document.createElement('div');
        modal.id = 'password-expiry-modal';
        modal.className = 'modal-mixin';

        var remainingText = '';
        if (typeof daysRemaining === 'number') {
            if (daysRemaining <= 0) {
                remainingText = 'Your password expires today.';
            } else if (daysRemaining === 1) {
                remainingText = 'Your password expires in 1 day.';
            } else {
                remainingText = 'Your password expires in ' + daysRemaining + ' days.';
            }
        }

        modal.innerHTML =
            '<div class="modal-overlay"></div>' +
            '<div class="modal-content password-expiry-modal-content">' +
                '<div class="modal-icon">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                        '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>' +
                        '<line x1="12" y1="9" x2="12" y2="13"></line>' +
                        '<line x1="12" y1="17" x2="12.01" y2="17"></line>' +
                    '</svg>' +
                '</div>' +
                '<div class="modal-title">Password Expiration Notice</div>' +
                '<div class="modal-message password-expiry-modal-message">' +
                    '<div>' + (remainingText || 'Your password is about to expire.') + '</div>' +
                    '<div class="password-expiry-modal-subtitle">The password is about to expire. Change it or cancel.</div>' +
                '</div>' +
                '<div class="password-expiry-fields">' +
                    '<label for="pwd-current">Current Password</label>' +
                    '<input id="pwd-current" type="password" autocomplete="current-password" />' +
                    '<label for="pwd-new">New Password</label>' +
                    '<input id="pwd-new" type="password" autocomplete="new-password" />' +
                    '<div id="pwd-modal-error" class="password-expiry-error"></div>' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button id="pwd-cancel" class="modal-btn-cancel">Cancel</button>' +
                    '<button id="pwd-change" class="modal-btn-ok" style="background:#e67e22;">Change Password</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        var userID = getUserId();
        var currentInput = document.getElementById('pwd-current');
        var newInput = document.getElementById('pwd-new');
        var errorBox = document.getElementById('pwd-modal-error');
        var cancelBtn = document.getElementById('pwd-cancel');
        var changeBtn = document.getElementById('pwd-change');

        function setError(text) {
            errorBox.textContent = text || '';
        }

        function closeModal(markSeen) {
            removeModal();
            if (markSeen && userID) {
                markSeenToday(userID);
            }
        }

        cancelBtn.addEventListener('click', function () {
            closeModal(options.markSeenOnClose === true);
        });

        modal.querySelector('.modal-overlay').addEventListener('click', function () {
            closeModal(options.markSeenOnClose === true);
        });

        changeBtn.addEventListener('click', function () {
            var currentPassword = (currentInput.value || '').trim();
            var newPassword = (newInput.value || '').trim();

            if (!currentPassword || !newPassword) {
                setError('Current and new password are required.');
                return;
            }

            if (currentPassword === newPassword) {
                setError('New password must be different from current password.');
                return;
            }

            setError('');
            changeBtn.disabled = true;

            fetch('/api/auth/change-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            })
                .then(function (res) { return res.json(); })
                .then(function (data) {
                    if (!data.ok) {
                        setError(data.message || 'Unable to update password.');
                        changeBtn.disabled = false;
                        return;
                    }

                    showToast('Password changed successfully.', 1);
                    closeModal(true);
                })
                .catch(function () {
                    setError('Unexpected error. Please try again.');
                    changeBtn.disabled = false;
                });
        });

        if (currentInput) {
            currentInput.focus();
        }
    }

    function getPasswordExpiryStatus() {
        return fetch('/api/auth/password-expiry', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        }).then(function (res) {
            if (!res.ok) {
                throw new Error('Request failed');
            }
            return res.json();
        });
    }

    function runDailyPasswordNotice() {
        var userID = getUserId();
        if (!userID) return;

        getPasswordExpiryStatus()
            .then(function (data) {
                if (!data || !data.ok || typeof data.daysRemaining !== 'number') {
                    return;
                }

                if (data.daysRemaining >= 0 && data.daysRemaining <= WARNING_THRESHOLD_DAYS && !wasSeenToday(userID)) {
                    renderPasswordModal(data.daysRemaining, { markSeenOnClose: true });
                }
            })
            .catch(function () {
                // Silent fail so pages continue rendering normally.
            });
    }

    window.openChangePasswordModal = function () {
        getPasswordExpiryStatus()
            .then(function (data) {
                var daysRemaining = (data && typeof data.daysRemaining === 'number') ? data.daysRemaining : null;
                renderPasswordModal(daysRemaining, { markSeenOnClose: false });
            })
            .catch(function () {
                renderPasswordModal(null, { markSeenOnClose: false });
            });
    };

    document.addEventListener('DOMContentLoaded', runDailyPasswordNotice);
}());
