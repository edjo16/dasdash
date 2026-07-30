/**
 * session-timeout.js
 * - Shows a warning modal after IDLE_TIMEOUT_MS of inactivity (default: 15 min)
 * - Gives GRACE_PERIOD_MS (default: 60 s) countdown before auto-logout
 * - Clicking "I'm Here" pings the server; a 401 means the session already
 *   expired server-side → redirects to /logout immediately
 * - Network errors re-enable the button so the user can retry
 */
(function () {
    var IDLE_TIMEOUT_MS = 10 * 60 * 1000;   // 15 minutes of inactivity
    var GRACE_PERIOD_MS = 60;               // 60 seconds grace period

    var idleTimer          = null;
    var countdownInterval  = null;
    var modalVisible       = false;
    var lastActivityAt     = Date.now();    // wall-clock time of last activity
    var lastBroadcastAt    = 0;

    /* ── cross-tab activity sync ────────────────────────────────── */
    // When another tab detects user activity it writes to localStorage.
    // All other tabs receive a 'storage' event and reset their timer.
    window.addEventListener('storage', function (e) {
        if (e.key === '_session_activity' && e.newValue) {
            var ts = parseInt(e.newValue, 10);
            if (ts && ts > lastActivityAt) {
                lastActivityAt = ts;
                if (!modalVisible) {
                    clearTimeout(idleTimer);
                    idleTimer = setTimeout(showWarningModal, IDLE_TIMEOUT_MS);
                }
            }
        }
    });

    function broadcastActivity() {
        var now = Date.now();
        if (now - lastBroadcastAt > 1000) {
            lastBroadcastAt = now;
            try {
                localStorage.setItem('_session_activity', now.toString());
            } catch (e) { /* quota exceeded or private mode */ }
        }
    }

    /* ── helpers ───────────────────────────────────────────────── */
    function resetIdleTimer() {
        if (modalVisible) return;          // freeze timer while warning is shown
        lastActivityAt = Date.now();
        broadcastActivity();
        clearTimeout(idleTimer);
        idleTimer = setTimeout(showWarningModal, IDLE_TIMEOUT_MS);
    }

    function closeModal() {
        var el = document.getElementById('session-timeout-modal');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        modalVisible = false;
    }

    function doLogout() {
        window.location.href = '/logout';
    }

    /* ── modal ─────────────────────────────────────────────────── */
    function showWarningModal() {
        if (modalVisible) return;
        modalVisible = true;

        var secondsLeft = GRACE_PERIOD_MS;

        var modal = document.createElement('div');
        modal.id        = 'session-timeout-modal';
        modal.className = 'modal-mixin';
        modal.innerHTML =
            '<div class="modal-overlay"></div>' +
            '<div class="modal-content">' +
                '<div class="modal-icon">' +
                    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" ' +
                    'viewBox="0 0 24 24" fill="none" stroke="#e67e22" stroke-width="2" ' +
                    'stroke-linecap="round" stroke-linejoin="round">' +
                        '<circle cx="12" cy="12" r="10"/>' +
                        '<polyline points="12 6 12 12 16 14"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="modal-title">Session Timeout Warning</div>' +
                '<div class="modal-message">' +
                    'Your session has been inactive for 10 minutes.<br>' +
                    'You will be automatically signed out in ' +
                    '<strong id="session-countdown">' + secondsLeft + '</strong> second(s).' +
                    '<br><br>' +
                    'Click <em>&ldquo;I&rsquo;m Here&rdquo;</em> to continue your session.' +
                '</div>' +
                '<div class="modal-actions">' +
                    '<button id="session-im-here-btn" class="modal-btn-ok" ' +
                    'style="background:#e67e22;min-width:140px;">I\'m Here</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        /* countdown tick */
        countdownInterval = setInterval(function () {
            secondsLeft--;
            var el = document.getElementById('session-countdown');
            if (el) el.textContent = secondsLeft;

            if (secondsLeft <= 0) {
                clearInterval(countdownInterval);
                closeModal();
                doLogout();
            }
        }, 1000);

        /* "I'm Here" button */
        var btn = document.getElementById('session-im-here-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                btn.disabled = true;
                fetch('/api/session/ping', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' }
                })
                .then(function (res) {
                    if (res.status === 401) {
                        // Session already expired on the server — go to login
                        clearInterval(countdownInterval);
                        doLogout();
                    } else {
                        clearInterval(countdownInterval);
                        closeModal();
                        resetIdleTimer();
                    }
                })
                .catch(function () {
                    // Network error — re-enable button so the user can retry
                    btn.disabled = false;
                });
            });
        }
    }

    /* ── activity + visibility listeners ───────────────────────── */
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(function (evt) {
        document.addEventListener(evt, resetIdleTimer, { passive: true });
    });

    // setTimeout does not tick while the OS is suspended, so we must measure
    // real elapsed time and act accordingly when the page becomes visible again.
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) return;

        var elapsed = Date.now() - lastActivityAt;

        if (modalVisible) {
            // Modal is already showing — if grace period is also exhausted, logout now
            var graceMs = GRACE_PERIOD_MS * 1000;
            if (elapsed >= IDLE_TIMEOUT_MS + graceMs) {
                clearInterval(countdownInterval);
                closeModal();
                doLogout();
            }
            // Otherwise let the visible countdown continue naturally
            return;
        }

        if (elapsed >= IDLE_TIMEOUT_MS) {
            // Idle window already passed while the OS was suspended — show modal now
            clearTimeout(idleTimer);
            showWarningModal();
        } else {
            // Resume with time still remaining — reset timer for the remaining window
            lastActivityAt = Date.now() - elapsed; // keep elapsed accurate
            clearTimeout(idleTimer);
            idleTimer = setTimeout(showWarningModal, IDLE_TIMEOUT_MS - elapsed);
        }
    });

    /* ── kick off ───────────────────────────────────────────────── */
    resetIdleTimer();
}());
