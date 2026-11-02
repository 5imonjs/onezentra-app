<!DOCTYPE html>
<html lang="id" dir="ltr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ONEZENTRA - Access Gateway</title>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/4.0.0-beta.2/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
</head>
<body class="bg-gray-50 min-h-screen">
    <div class="max-w-2xl mx-auto p-4">
        
        <!-- Step 1: Region Configuration -->
        <div id="step-region" class="space-y-4">
            <div class="bg-white rounded-3xl p-8 shadow-xl">
                <div class="flex items-center gap-3 mb-6">
                    <div class="flex-1">
                        <h1 class="text-3xl font-bold text-gray-900">Central Access</h1>
                        <p class="text-sm text-gray-500">Secure Gateway</p>
                    </div>
                    <div class="flex-0 shrink-0">
                        <button class="rounded-full p-2 bg-primary-100 text-primary-600 text-sm hover:bg-primary-200 transition-colors" id="theme-toggle">
                            <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path class="stroke-2" d="M20.354 15.354A9 9 0 011.646 3.646 9.003 9.003 0 0011 15.354 9.003 9.003 0 0020.354 7.646 9.003 9.003 0 0011 18.998z"/>
                                <path class="stroke-2" d="M12 2L2 12h6l8 8"/>
                            </svg>
                        </button>
                    </div>
                </div>
                
                <div>
                    <h2 class="text-xl font-bold text-gray-900 mb-2">Konfigurasi Lingkungan</h2>
                    <p class="text-sm text-gray-500 mb-6">
                    Silakan konfigurasi Region dan Depo untuk mengakses sistem ONEZENTRA.
                    </p>
                </div>
                
                <!-- Region Access Address -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Region Access Address
                    </label>
                    <div class="relative">
                        <span class="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-gray-400">onezentra.sbs</span>
                        <input type="text" 
                            id="region-address" 
                            class="bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            value="onezentra.sbs"
                            readonly
                            aria-label="Region Access Address">
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                        Alamat dikelola server. Port internal tidak perlu diisi manual.
                    </p>
                </div>
                
                <!-- Region Code -->
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Region Code
                    </label>
                    <input type="text"
                        id="region-code"
                        class="bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Contoh: 001"
                        autocomplete="off"
                        aria-label="Region Code">
                    <p class="text-xs text-gray-500 mt-1">
                    Kode Region bukan username. Gunakan kode yang diberikan administrator.
                    </p>
                </div>
                
                <!-- Connection Status -->
                <div id="connection-status" class="mt-4 pt-4 border-t border-gray-100">
                    <div class="flex items-center gap-2 text-sm">
                        <span class="h-2 w-2 rounded-full bg-gray-300"></span>
                        <span class="text-gray-500" id="status-text">Region belum divalidasi</span>
                    </div>
                </div>
                
                <button 
                    id="validate-region-btn"
                    class="w-full rounded-md bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                    Validasi Region & Lanjutkan
                </button>
            </div>
        </div>
        
        <!-- Step 2: Depo Identification -->
        <div id="step-depo" class="hidden space-y-4">
            <div class="bg-white rounded-3xl p-8 shadow-xl">
                <div class="flex items-center gap-3 mb-6">
                    <div class="flex-1">
                        <h2 class="text-2xl font-bold text-gray-900">Identifikasi Depo</h2>
                        <p class="text-sm text-gray-500">
                        Pilih depo yang berada di Region yang telah divalidasi.
                        </p>
                    </div>
                    <button class="rounded-md bg-gray-100 text-gray-500 text-sm hover:bg-gray-100 py-1 px-3 transition-colors" id="back-to-region">
                        Kembali
                    </button>
                </div>
                
                <div>
                    <h3 class="font-medium text-gray-900 mb-4">Region terpilih</h3>
                    <div class="flex items-center gap-3">
                        <div class="flex-1 min-w-0">
                            <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
                            <p class="text-sm font-medium text-gray-900" id="selected-region">REGION-A · REGION A</p>
                        </div>
                        <div class="w-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-primary-600 rounded-full transition-all duration-300" id="region-progress"></div>
                        </div>
                    </div>
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        Cari atau Masukkan Kode Depo
                    </label>
                    <div class="relative">
                        <input type="text"
                            id="depo-code"
                            class="bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            placeholder="Ketik kode depo atau pilih dari daftar"
                            aria-label="Depo Code">
                        <svg class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path class="stroke-2" d="M9 18l6-6-6-6"/>
                        </svg>
                    </div>
                    <p class="text-xs text-gray-500 mt-1">
                    Depo harus terdaftar di Region yang dipilih.
                    </p>
                </div>
                
                <div id="depo-list" class="mt-4 space-y-2 max-h-96 overflow-y-auto">
                    <!-- Depo options will be injected here -->
                </div>
                
                <div class="mt-6">
                    <button 
                        id="validate-depo-btn"
                        class="w-full rounded-md bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-available">
                        Lanjutkan ke Login
                    </button>
                </div>
            </div>
        </div>
        
        <!-- Step 3: User Authentication -->
        <div id="step-login" class="hidden space-y-4">
            <div class="bg-white rounded-3xl p-8 shadow-xl">
                <div class="flex items-center gap-3 mb-6">
                    <div class="flex-1">
                        <h2 class="text-2xl font-bold text-gray-900">Secure Login</h2>
                        <p class="text-sm text-gray-500">
                        Masuk ke akun operasional Anda.
                        </p>
                    </div>
                    <button class="rounded-md bg-gray-100 text-gray-500 text-sm hover:bg-gray-100 py-1 px-3 transition-colors" id="back-to-depo">
                        Kembali ke Depo
                    </button>
                </div>
                
                <div>
                    <h3 class="font-medium text-gray-900 mb-4">Lingkungan yang telah dipilih</h3>
                    <div class="flex items-center gap-3">
                        <div class="flex-1 min-w-0">
                            <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Region</p>
                            <p class="text-sm font-medium text-gray-900" id="login-region">REGION-A · REGION A</p>
                        </div>
                        <div class="w-1 h-6 bg-gray-200 rounded-full overflow-hidden">
                            <div class="h-full bg-primary-600 rounded-full transition-all duration-300" id="login-region-progress"></div>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Depo</p>
                        <p class="text-sm font-medium text-gray-900" id="login-depo">DEPO-A1 · Depo A1</p>
                    </div>
                </div>
                
                <form id="login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Username
                        </label>
                        <input type="text"
                            id="username"
                            class="bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            placeholder="Masukkan username"
                            autocomplete="username"
                            required>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            Password
                        </label>
                        <div class="relative">
                            <input type="password"
                                id="password"
                                class="bg-white border border-gray-300 rounded-lg px-4 py-2.5 w-full text-sm font-medium text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                placeholder="Masukkan password"
                                autocomplete="current-password"
                                required>
                            <button type="button"
                                id="toggle-password"
                                class="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-500/10"
                                aria-label="Toggle password visibility">
                                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path class="stroke-2" d="M17.94 17.94A10.07 10.07 0 0112 21a10.07 10.07 0 01-5.94-1.23l-1.61 1.61a2 2 0 01-1.41-2.83l2.36-5.37a2 2 0 012.83 0l1.52 5.25a2 2 0 01.18 2.53zM7 17a2 2 0 012-4h3a2 2 0 012 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1zm8-6a2 2 0 11-4 0 2 2 0 014 0zM5 7a2 2 0 10-4 0 2 2 0 014 0z"/>
                                </svg>
                            </button>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">
                        Akses sesuai hak dan kewenangan pengguna pada Region/Depo terpilih.
                        </p>
                    </div>
                    
                    <div class="flex items-start gap-2">
                        <input type="checkbox"
                            id="remember-me"
                            class="rounded border border-gray-300 w-4 h-4 shrink-0 focus:ring-2 focus:ring-primary-500">
                        <span class="text-sm text-gray-600">
                        Ingat konfigurasi Region & Depo di perangkat ini.
                        Email dan password tidak disimpan.
                        </span>
                    </div>
                    
                    <!-- Error message -->
                    <div id="login-error" class="hidden rounded-md bg-red-100 border border-red-400 px-4 py-3 text-sm text-red-700" role="alert">
                        <span id="login-error-text"></span>
                    </div>
                    
                    <button type="submit"
                        id="login-btn"
                        class="w-full rounded-md bg-primary-600 px-4 py-3 text-sm font-medium text-white hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-available">
                        Login ke Sistem
                    </button>
                </form>
            </div>
        </div>
        
        <!-- Step 4: Success / Dashboard redirect -->
        <div id="step-success" class="hidden">
            <div class="bg-white rounded-3xl p-8 shadow-xl max-w-md mx-auto text-center">
                <div class="inline-flex items-center gap-2 mb-6">
                    <div class="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center">
                        <svg class="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path class="stroke-2" d="M20 6L9 17h5v2H9v2h5l-5 5-5-5h5v-2H5v-2h5L6 6"/>
                        </svg>
                    </div>
                    <span class="text-xl font-bold text-green-600">Berhasil!</span>
                </div>
                <p class="text-gray-500 mb-6">Anda telah berhasil login ke sistem ONEZENTRA.</p>
                <p class="text-sm text-gray-500">
                Anda dialihkan ke halaman dashboard sesuai kewenangan Region dan Depo Anda.
                </p>
                <button id="goto-dashboard"
                    class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors">
                    Masuk ke Dashboard
                </button>
            </div>
        </div>
    </div>
    
    <script>
        // Check for saved configuration
        document.addEventListener('DOMContentLoaded', function() {
            const savedRegion = localStorage.getItem('selected-region');
            const savedDepo = localStorage.getItem('selected-depo');
            
            if (savedRegion) {
                document.getElementById('region-address').value = savedRegion.split(' · ')[0] || 'onezentra.sbs';
                document.getElementById('selected-region').textContent = savedRegion;
                document.getElementById('step-region').classList.add('hidden');
                document.getElementById('step-depo').classList.remove('hidden');
                document.getElementById('selected-region').textContent = savedRegion;
                document.getElementById('depo-code').value = savedDepo || '';
            }
        });
        
        // Theme toggle
        const themeToggle = document.getElementById('theme-toggle');
        themeToggle.addEventListener('click', function() {
            document.body.classList.toggle('dark');
        });
        
        // Password visibility toggle
        const passwordInput = document.getElementById('password');
        const togglePassword = document.getElementById('toggle-password');
        let isPasswordVisible = false;
        
        togglePassword.addEventListener('click', function() {
            isPasswordVisible = !isPasswordVisible;
            passwordInput.type = isPasswordVisible ? 'text' : 'password';
            togglePassword.textContent = isPasswordVisible ? 'Sembunyikan' : 'Tampilkan';
        });
        
        // Region validation
        const validateRegionBtn = document.getElementById('validate-region-btn');
        const connectionStatus = document.getElementById('connection-status');
        const statusText = document.getElementById('status-text');
        
        validateRegionBtn.addEventListener('click', function() {
            const regionCode = document.getElementById('region-code').value.trim();
            if (!regionCode) {
                alert('Region Code wajib diisi');
                return;
            }
            
            // Simulate validation
            connectionStatus.innerHTML = `
                <span class="h-2 w-2 rounded-full bg-amber-500"></span>
                <span>Menghubungi server Region...</span>
            `;
            
            // Simulate successful validation after 1 second
            setTimeout(function() {
                document.getElementById('step-region').classList.add('hidden');
                document.getElementById('step-depo').classList.remove('hidden');
                document.getElementById('selected-region').textContent = 'REGION-A · REGION A';
                document.getElementById('depo-code').focus();
            }, 1000);
        });
        
        // Depo validation
        const validateDepoBtn = document.getElementById('validate-depo-btn');
        const depoCodeInput = document.getElementById('depo-code');
        
        validateDepoBtn.addEventListener('click', function() {
            const depoCode = depoCodeInput.value.trim();
            if (!depoCode) {
                alert('Kode Depo wajib diisi');
                return;
            }
            
            // Simulate depo validation
            document.getElementById('step-depo').classList.add('hidden');
            document.getElementById('step-login').classList.remove('hidden');
            document.getElementById('login-region').textContent = 'REGION-A · REGION A';
            document.getElementById('login-depo').textContent = 'DEPO-A1 · Depo A1';
        });
        
        // Back to region
        const backToRegionBtn = document.getElementById('back-to-region');
        const backToDepoBtn = document.getElementById('back-to-depo');
        
        backToRegionBtn.addEventListener('click', function() {
            document.getElementById('step-depo').classList.add('hidden');
            document.getElementById('step-region').classList.remove('hidden');
        });
        
        backToDepoBtn.addEventListener('click', function() {
            document.getElementById('step-login').classList.add('hidden');
            document.getElementById('step-depo').classList.remove('hidden');
        });
        
        // Login form
        const loginForm = document.getElementById('login-form');
        const loginBtn = document.getElementById('login-btn');
        const loginError = document.getElementById('login-error');
        const loginErrorText = document.getElementById('login-error-text');
        
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            
            if (!username || !password) {
                loginError.classList.remove('hidden');
                loginErrorText.textContent = 'Username dan password wajib diisi';
                return;
            }
            
            // Simulate login
            loginForm.classList.add('hidden');
            document.getElementById('step-success').classList.remove('hidden');
        });
        
        // Go to dashboard
        const gotoDashboardBtn = document.getElementById('goto-dashboard');
        gotoDashboardBtn.addEventListener('click', function() {
            // In real app, this would navigate to the dashboard
            alert('Diberhinkan ke dashboard ONEZENTRA');
        });
    </script>
</body>
</html>