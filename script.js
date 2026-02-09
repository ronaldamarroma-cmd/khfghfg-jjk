import { initializeApp } from "https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, 
    enableIndexedDbPersistence, query, orderBy, writeBatch 
} from "https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js";

// --- 1. إعدادات Firebase ---
const firebaseConfig = {
    apiKey: "AIzaSyBDLi_GeRcjH7kZhsHhERIBQujgNuRkEr8",
    authDomain: "jhhjhj-d5844.firebaseapp.com",
    projectId: "jhhjhj-d5844",
    storageBucket: "jhhjhj-d5844.firebasestorage.app",
    messagingSenderId: "889709721341",
    appId: "1:889709721341:web:359c934e106d0a2ca47094"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// تفعيل وضع الأوفلاين (IndexedDB)
enableIndexedDbPersistence(db)
    .then(() => console.log("تم تفعيل وضع الأوفلاين بنجاح"))
    .catch((err) => {
        if (err.code == 'failed-precondition') {
            console.log("تعدد التبويبات المفتوحة قد يمنع الأوفلاين");
        } else if (err.code == 'unimplemented') {
            console.log("المتصفح لا يدعم هذه الخاصية");
        }
    });

// --- 2. إدارة البيانات المحلية (State Management) ---
let appData = {
    globalLock: false,
    users: [],
    receipts: [],
    currentUser: null
};

// تشغيل Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('Service Worker Ready'))
            .catch(err => console.log('SW Fail', err));
    });
}

// بدء الاستماع للتغييرات (Realtime Listener)
function startListeners() {
    // استماع للمستخدمين
    onSnapshot(collection(db, "users"), (snapshot) => {
        appData.users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // إذا كانت قاعدة البيانات فارغة، قم بإنشاء الأدمن الافتراضي
        if(appData.users.length === 0) {
            addDoc(collection(db, "users"), {
                name: "الإدارة العامة",
                code: "112200", 
                role: "admin",
                booksCount: 0,
                locked: false,
                timestamp: Date.now()
            });
        }

        // تحديث الواجهة إذا كان المستخدم مسجلاً
        if(appData.currentUser) refreshUI();
    });

    // استماع للوصولات - تعديل الفرز ليكون تصاعدي (الأقدم أولاً)
    const q = query(collection(db, "receipts"), orderBy("id", "asc"));
    onSnapshot(q, (snapshot) => {
        appData.receipts = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
        if(appData.currentUser) refreshUI();
    });

    // استماع لإعدادات النظام (القفل العام)
    onSnapshot(collection(db, "settings"), (snapshot) => {
        if(!snapshot.empty) {
            appData.globalLock = snapshot.docs[0].data().globalLock;
            if(appData.currentUser) updateGlobalLockButton();
        } else {
            // إنشاء إعدادات افتراضية
            addDoc(collection(db, "settings"), { globalLock: false });
        }
    });
}

startListeners();

// --- 3. دوال الواجهة (تحديث تلقائي) ---
function refreshUI() {
    if(appData.currentUser.role === 'admin') {
        initAdminView();
    } else {
        // تحديث بيانات المستخدم الحالي من الداتا بيس
        const freshUser = appData.users.find(u => u.code === appData.currentUser.code);
        if(freshUser) {
            appData.currentUser = freshUser;
            initAgentView();
        }
    }
}

// --- 4. إدارة الدخول ---
window.handleLogin = function() {
    const code = document.getElementById('login-code').value;
    attemptLogin(code, false);
}

// التحقق من الدخول التلقائي
const savedUserCode = localStorage.getItem('autoLoginCode');
if (savedUserCode) {
    // ننتظر قليلاً لتحميل البيانات ثم نحاول الدخول
    setTimeout(() => attemptLogin(savedUserCode, true), 1000);
}

function attemptLogin(code, isAuto) {
    const user = appData.users.find(u => u.code === code);

    if (!user) {
        if (!isAuto && appData.users.length > 0) alert('الرمز غير صحيح!');
        return;
    }

    if (user.role !== 'admin') {
        if (appData.globalLock) {
            alert('النظام مغلق مؤقتاً.');
            return;
        }
        if (user.locked) {
            alert('حسابك موقوف.');
            return;
        }
    }

    localStorage.setItem('autoLoginCode', code);
    appData.currentUser = user;
    
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('user-display-name').textContent = user.name;
    
    refreshUI();
}

window.logout = function() {
    localStorage.removeItem('autoLoginCode');
    appData.currentUser = null;
    location.reload();
}

// --- 5. منطق المخول ---
function initAgentView() {
    document.getElementById('agent-view').classList.remove('hidden');
    document.getElementById('admin-view').classList.add('hidden');
    if(!document.getElementById('date').value) {
        document.getElementById('date').valueAsDate = new Date();
    }
    
    document.getElementById('agent-books-input').value = appData.currentUser.booksCount || "";
    
    // التحقق من نوع المخول لإخفاء/إظهار القاطع
    const sectorGroup = document.getElementById('sector-group');
    if (appData.currentUser.agentType === 'friday_prayer') {
        sectorGroup.classList.add('hidden'); // إخفاء القائمة
    } else {
        sectorGroup.classList.remove('hidden');
    }

    renderAgentTable();
    updateReceiptNumber(); 
}

window.checkBookSave = function() {
    const newCount = document.getElementById('agent-books-input').value;
    if (appData.currentUser.booksCount && appData.currentUser.booksCount > 0) {
        document.getElementById('pin-modal').classList.remove('hidden');
        document.getElementById('book-edit-pin').value = '';
        document.getElementById('book-edit-pin').focus();
    } else {
        saveAgentBooksFunc(newCount);
    }
}

window.verifyBookPin = function() {
    const pin = document.getElementById('book-edit-pin').value;
    if (pin === '1001') { // رمز تعديل الدفتر للمخول
        const newCount = document.getElementById('agent-books-input').value;
        saveAgentBooksFunc(newCount);
        window.closePinModal();
    } else {
        alert('رمز خاطئ!');
    }
}

window.closePinModal = function() {
    document.getElementById('pin-modal').classList.add('hidden');
    document.getElementById('agent-books-input').value = appData.currentUser.booksCount || "";
}

function saveAgentBooksFunc(count) {
    const userDocRef = doc(db, "users", appData.currentUser.id);
    updateDoc(userDocRef, { booksCount: count })
        .then(() => alert('تم حفظ عدد الدفاتر.'))
        .catch(err => alert('خطأ في الحفظ: ' + err.message));
}

window.updateReceiptNumber = function() {
    const startNum = parseInt(document.getElementById('start-receipt-num').value) || 0;
    const currentVal = document.getElementById('receipt-num').value;
    
    const myReceipts = appData.receipts.filter(r => r.userId === appData.currentUser.id);
    // الترتيب تصاعدي
    myReceipts.sort((a, b) => a.receiptNum - b.receiptNum);
    
    let nextNum;
    if (myReceipts.length > 0) {
        const lastNum = myReceipts[myReceipts.length - 1].receiptNum;
        nextNum = (startNum > lastNum) ? startNum : (lastNum + 1);
    } else {
        nextNum = startNum > 0 ? startNum : 1;
    }

    if(!currentVal) {
        document.getElementById('receipt-num').value = nextNum;
    }
}

window.addOrUpdateReceipt = function() {
    const editId = document.getElementById('edit-receipt-id').value; 
    const receiptNum = document.getElementById('receipt-num').value;
    const donorName = document.getElementById('donor-name').value;
    const amount = document.getElementById('amount').value;
    const date = document.getElementById('date').value;
    let sector = document.getElementById('sector').value;
    const notes = document.getElementById('notes').value;

    // إذا كان المخول صلاة جمعة، يتم تعيين القاطع تلقائياً
    if (appData.currentUser.agentType === 'friday_prayer') {
        sector = "صلاة الجمعة مدينة الصدر";
    }

    if (!donorName || !amount || !receiptNum || !date || !sector) {
        alert('يرجى ملء جميع الحقول');
        return;
    }

    const receiptData = {
        receiptNum: parseInt(receiptNum),
        donorName,
        amount: parseFloat(amount),
        date,
        sector,
        notes
    };

    if (editId) {
        const receiptRef = doc(db, "receipts", editId);
        updateDoc(receiptRef, receiptData)
            .then(() => {
                alert('تم التعديل');
                window.cancelEdit();
            });
    } else {
        if(appData.receipts.some(r => r.receiptNum == receiptNum)) {
            alert('رقم الوصل مكرر!');
            return;
        }

        const newReceipt = {
            ...receiptData,
            id: Date.now(), 
            userId: appData.currentUser.id, 
            userName: appData.currentUser.name,
            entryDate: new Date().toLocaleString('ar-IQ')
        };

        addDoc(collection(db, "receipts"), newReceipt)
            .then(() => {
                alert('تمت الإضافة');
                document.getElementById('donor-name').value = '';
                document.getElementById('amount').value = '';
                document.getElementById('notes').value = '';
                document.getElementById('receipt-num').value = parseInt(receiptNum) + 1;
            });
    }
}

window.prepareEdit = function(docId) {
    const receipt = appData.receipts.find(r => r.docId === docId);
    if (!receipt) return;

    document.getElementById('edit-receipt-id').value = receipt.docId;
    document.getElementById('receipt-num').value = receipt.receiptNum;
    document.getElementById('donor-name').value = receipt.donorName;
    document.getElementById('amount').value = receipt.amount;
    document.getElementById('date').value = receipt.date;
    
    // إذا كان مخول عادي نظهر القاطع المختار، صلاة الجمعة مخفي أصلاً
    if (appData.currentUser.agentType !== 'friday_prayer') {
        document.getElementById('sector').value = receipt.sector;
    }

    document.getElementById('notes').value = receipt.notes;

    document.getElementById('form-title').innerText = "تعديل الوصل";
    document.getElementById('save-btn').innerText = "حفظ التعديلات";
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    document.getElementById('form-title').scrollIntoView({behavior: 'smooth'});
}

window.cancelEdit = function() {
    document.getElementById('edit-receipt-id').value = '';
    document.getElementById('form-title').innerHTML = '<i class="fas fa-plus-circle"></i> إضافة وصل جديد';
    document.getElementById('save-btn').innerText = "حفظ الوصل";
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    document.getElementById('donor-name').value = '';
    document.getElementById('amount').value = '';
    document.getElementById('notes').value = '';
    window.updateReceiptNumber();
}

function renderAgentTable() {
    const tbody = document.querySelector('#agent-table tbody');
    tbody.innerHTML = '';
    
    const myReceipts = appData.receipts.filter(r => r.userId === appData.currentUser.id);
    
    document.getElementById('agent-receipts-count').innerText = myReceipts.length;
    const totalMyAmount = myReceipts.reduce((sum, r) => sum + r.amount, 0);
    document.getElementById('agent-total-amount').innerText = totalMyAmount.toLocaleString() + ' د.ع';

    // الترتيب: الأقدم أولاً (10, 11, 12) كما طلبت
    myReceipts.sort((a, b) => a.receiptNum - b.receiptNum).forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.receiptNum}</td>
            <td>${r.donorName}</td>
            <td>${r.amount.toLocaleString()}</td>
            <td>${r.date}</td>
            <td>${r.notes}</td>
            <td>
                <button onclick="window.prepareEdit('${r.docId}')" class="btn btn-warning" style="padding: 5px;"><i class="fas fa-edit"></i></button>
                <button onclick="window.deleteReceipt('${r.docId}')" class="btn btn-danger" style="padding: 5px;"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.deleteReceipt = function(docId) {
    if(confirm('حذف؟')) {
        deleteDoc(doc(db, "receipts", docId));
    }
}

window.exportAgentData = function() {
    const myReceipts = appData.receipts.filter(r => r.userId === appData.currentUser.id);
    if(myReceipts.length === 0) { alert('لا توجد بيانات'); return; }

    // التأكد من الترتيب عند التصدير
    myReceipts.sort((a, b) => a.receiptNum - b.receiptNum);

    const dataToExport = myReceipts.map(r => ({
        "رقم الوصل": r.receiptNum,
        "اسم المساهم": r.donorName,
        "المبلغ": r.amount,
        "التاريخ": r.date,
        "القاطع": r.sector,
        "الملاحظات": r.notes
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الوصولات");
    XLSX.writeFile(wb, `وصولات_${appData.currentUser.name}.xlsx`);
}

// --- 6. منطق الأدمن ---
function initAdminView() {
    document.getElementById('agent-view').classList.add('hidden');
    document.getElementById('admin-view').classList.remove('hidden');
    updateAdminStats();
    populateAgentFilter();
    window.renderAdminTable();
    renderUsersControlTable();
    updateGlobalLockButton();
}

function updateAdminStats() {
    const totalAmount = appData.receipts.reduce((sum, r) => sum + r.amount, 0);
    const agentCount = appData.users.filter(u => u.role === 'agent').length;
    document.getElementById('total-amount').innerText = totalAmount.toLocaleString() + ' د.ع';
    document.getElementById('total-percentage').innerText = (totalAmount * 0.10).toLocaleString() + ' د.ع';
    document.getElementById('total-agents').innerText = agentCount;
    document.getElementById('total-receipts').innerText = appData.receipts.length;
}

function populateAgentFilter() {
    const select = document.getElementById('admin-filter-agent');
    select.innerHTML = '<option value="all">كل المخولين</option>';
    appData.users.filter(u => u.role === 'agent').forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.name;
        select.appendChild(opt);
    });
}

window.renderAdminTable = function() {
    const tbody = document.querySelector('#admin-table tbody');
    tbody.innerHTML = '';
    const searchTerm = document.getElementById('admin-search').value.toLowerCase();
    const filterAgent = document.getElementById('admin-filter-agent').value;

    let filteredReceipts = appData.receipts.filter(r => {
        const agentUser = appData.users.find(u => u.id === r.userId);
        const agentName = agentUser ? agentUser.name : r.userName;
        const matchesSearch = r.donorName.toLowerCase().includes(searchTerm) || 
                              r.receiptNum.toString().includes(searchTerm) ||
                              agentName.toLowerCase().includes(searchTerm);
        const matchesAgent = filterAgent === 'all' || r.userId == filterAgent;
        return matchesSearch && matchesAgent;
    });

    // الترتيب تصاعدي للأدمن أيضاً
    filteredReceipts.sort((a, b) => a.receiptNum - b.receiptNum);

    filteredReceipts.forEach(r => {
        const agentUser = appData.users.find(u => u.id === r.userId);
        const agentName = agentUser ? agentUser.name : r.userName;
        // تحديد النص الظاهر للنوع
        const typeLabel = agentUser && agentUser.agentType === 'friday_prayer' ? 'صلاة جمعة' : 'مخول عادي';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${r.receiptNum}</td>
            <td>${agentName}</td>
            <td>${typeLabel}</td>
            <td>${r.sector}</td> <td>${r.donorName}</td>
            <td>${r.amount.toLocaleString()}</td>
            <td>${r.date}</td>
            <td><small>${r.entryDate}</small></td>
            <td>
                <div style="display:flex; gap:5px;">
                    <button onclick="window.prepareAdminEdit('${r.docId}')" class="btn btn-warning" style="padding: 2px 8px; font-size: 10px;">تعديل</button>
                    <button onclick="window.deleteReceipt('${r.docId}')" class="btn btn-danger" style="padding: 2px 8px; font-size: 10px;">حذف</button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// تعديل الأدمن
window.prepareAdminEdit = function(docId) {
    const receipt = appData.receipts.find(r => r.docId === docId);
    if(!receipt) return;
    document.getElementById('admin-edit-receipt-id').value = receipt.docId;
    document.getElementById('admin-edit-num').value = receipt.receiptNum;
    document.getElementById('admin-edit-donor').value = receipt.donorName;
    document.getElementById('admin-edit-amount').value = receipt.amount;
    document.getElementById('admin-edit-date').value = receipt.date;
    document.getElementById('admin-edit-sector').value = receipt.sector;
    document.getElementById('admin-edit-notes').value = receipt.notes;
    document.getElementById('admin-edit-receipt-modal').classList.remove('hidden');
}

window.saveAdminReceiptEdit = function() {
    const docId = document.getElementById('admin-edit-receipt-id').value;
    updateDoc(doc(db, "receipts", docId), {
        receiptNum: parseInt(document.getElementById('admin-edit-num').value),
        donorName: document.getElementById('admin-edit-donor').value,
        amount: parseFloat(document.getElementById('admin-edit-amount').value),
        date: document.getElementById('admin-edit-date').value,
        sector: document.getElementById('admin-edit-sector').value,
        notes: document.getElementById('admin-edit-notes').value
    }).then(() => {
        window.closeAdminEditModal();
        alert('تم التعديل');
    });
}

window.closeAdminEditModal = function() {
    document.getElementById('admin-edit-receipt-modal').classList.add('hidden');
}

// إدارة المستخدمين
function renderUsersControlTable() {
    const tbody = document.querySelector('#users-control-table tbody');
    tbody.innerHTML = '';
    appData.users.filter(u => u.role === 'agent').forEach(u => {
        // تحديد النص الظاهر للنوع
        const typeLabel = u.agentType === 'friday_prayer' ? 'صلاة جمعة' : 'مخول عادي';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${u.name}</td>
            <td>${u.phone || '-'}</td>
            <td><small>${typeLabel}</small></td>
            <td><strong style="color:var(--primary); font-size:1.1em;">${u.booksCount || 0}</strong></td>
            <td>${u.address || '-'}</td>
            <td>${u.locked ? '<span style="color:red;">مقفول</span>' : '<span style="color:green;">نشط</span>'}</td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button onclick="window.toggleUserLock('${u.id}')" class="btn ${u.locked ? 'btn-primary' : 'btn-danger'}" style="padding: 5px 10px; font-size: 11px;">
                        ${u.locked ? '<i class="fas fa-unlock"></i>' : '<i class="fas fa-lock"></i>'}
                    </button>
                    <button onclick="window.prepareEditAgent('${u.id}')" class="btn btn-warning" style="padding: 5px 10px; font-size: 11px;"><i class="fas fa-user-edit"></i></button>
                    <button onclick="window.deleteAgent('${u.id}')" class="btn btn-danger" style="padding: 5px 10px; font-size: 11px;"><i class="fas fa-user-minus"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleUserLock = function(docId) {
    const user = appData.users.find(u => u.id === docId);
    if(user) {
        updateDoc(doc(db, "users", docId), { locked: !user.locked });
    }
}

window.prepareEditAgent = function(docId) {
    const user = appData.users.find(u => u.id === docId);
    if (!user) return;
    document.getElementById('edit-agent-id').value = user.id;
    document.getElementById('new-agent-name').value = user.name;
    document.getElementById('new-agent-phone').value = user.phone;
    document.getElementById('new-agent-address').value = user.address;
    document.getElementById('new-agent-code').value = user.code;
    // تعيين النوع
    document.getElementById('new-agent-type').value = user.agentType || 'normal';
    
    document.getElementById('agent-modal-title').innerText = "تعديل بيانات المخول";
    window.toggleAgentModal();
}

window.deleteAgent = function(docId) {
    if(confirm('حذف المخول؟')) {
        deleteDoc(doc(db, "users", docId));
    }
}

window.toggleAgentModal = function() {
    const modal = document.getElementById('agent-modal');
    modal.classList.toggle('hidden');
    if(modal.classList.contains('hidden')) {
        document.getElementById('edit-agent-id').value = '';
        document.getElementById('new-agent-name').value = '';
        document.getElementById('new-agent-phone').value = '';
        document.getElementById('new-agent-address').value = '';
        document.getElementById('new-agent-code').value = '';
        document.getElementById('new-agent-type').value = 'normal';
        document.getElementById('agent-modal-title').innerText = "إضافة مخول جديد";
    }
}

window.saveAgentProcess = function() {
    const editId = document.getElementById('edit-agent-id').value;
    const name = document.getElementById('new-agent-name').value;
    const phone = document.getElementById('new-agent-phone').value;
    const address = document.getElementById('new-agent-address').value;
    const code = document.getElementById('new-agent-code').value;
    const agentType = document.getElementById('new-agent-type').value; // قراءة النوع

    if(!name || !code) { alert('الاسم والرمز حقول إجبارية'); return; }

    if (editId) {
        if(appData.users.some(u => u.code === code && u.id != editId)) {
            alert('الرمز مستخدم مسبقاً'); return;
        }
        updateDoc(doc(db, "users", editId), { name, phone, address, code, agentType })
            .then(() => { alert('تم التعديل'); window.toggleAgentModal(); });
    } else {
        if(appData.users.some(u => u.code === code)) { alert('الرمز مستخدم'); return; }
        addDoc(collection(db, "users"), {
            name, phone, address, code, agentType, role: 'agent', booksCount: 0, locked: false, timestamp: Date.now()
        }).then(() => { alert('تمت الإضافة'); window.toggleAgentModal(); });
    }
}

// دالة معالجة ملف الإكسل لإضافة المخولين
window.processAgentExcel = function(input) {
    const file = input.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet);

        if(jsonData.length === 0) { alert('الملف فارغ'); return; }

        if(!confirm(`هل أنت متأكد من إضافة ${jsonData.length} مخول؟`)) return;

        const batch = writeBatch(db);
        let count = 0;

        jsonData.forEach(row => {
            // المتوقع في الإكسل: الاسم, الهاتف, العنوان, الرمز, النوع
            // النوع في الإكسل يفضل أن يكون: "normal" أو "friday_prayer"
            const code = String(row['الرمز'] || row['code']);
            if(appData.users.some(u => u.code === code)) return; // تخطي المكرر

            const docRef = doc(collection(db, "users"));
            batch.set(docRef, {
                name: row['الاسم'] || row['name'],
                phone: row['الهاتف'] || row['phone'] || '',
                address: row['العنوان'] || row['address'] || '',
                code: code,
                agentType: row['النوع'] || row['type'] === 'صلاة جمعة' ? 'friday_prayer' : 'normal',
                role: 'agent',
                booksCount: 0,
                locked: false,
                timestamp: Date.now()
            });
            count++;
        });

        batch.commit().then(() => {
            alert(`تم إضافة ${count} مخول بنجاح`);
            input.value = ''; // تصفير الملف
        }).catch(err => alert('حدث خطأ: ' + err.message));
    };
    reader.readAsArrayBuffer(file);
}

// وظائف عامة للأدمن
window.clearAllData = function() {
    if(confirm('تحذير: سيتم حذف جميع الوصولات!')) {
        appData.receipts.forEach(r => {
            deleteDoc(doc(db, "receipts", r.docId));
        });
        appData.users.forEach(u => {
            if(u.role === 'agent') {
                updateDoc(doc(db, "users", u.id), { booksCount: 0 });
            }
        });
        alert('تم تفريغ البيانات');
    }
}

window.toggleGlobalLock = function() {
    // نحتاج لجلب ID وثيقة الإعدادات أولاً
    getFirestore(app).collection("settings").get().then(snap => {
        if(!snap.empty) {
            const docId = snap.docs[0].id;
            updateDoc(doc(db, "settings", docId), { globalLock: !appData.globalLock });
        }
    });
}

function updateGlobalLockButton() {
    const btn = document.getElementById('global-lock-btn');
    if (appData.globalLock) {
        btn.innerHTML = '<i class="fas fa-unlock"></i> فتح النظام للجميع';
        btn.classList.replace('btn-dark', 'btn-primary');
    } else {
        btn.innerHTML = '<i class="fas fa-lock"></i> قفل النظام عام';
        btn.classList.replace('btn-primary', 'btn-dark');
    }
}

window.toggleAgentsSummaryModal = function() {
    document.getElementById('agents-summary-modal').classList.toggle('hidden');
    if (!document.getElementById('agents-summary-modal').classList.contains('hidden')) {
        const tbody = document.querySelector('#agents-summary-table tbody');
        tbody.innerHTML = '';
        appData.users.filter(u => u.role === 'agent').forEach(u => {
            const userReceipts = appData.receipts.filter(r => r.userId === u.id);
            const totalAmount = userReceipts.reduce((sum, r) => sum + r.amount, 0);
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.name}</td><td>${userReceipts.length}</td><td style="font-weight:bold;">${totalAmount.toLocaleString()} د.ع</td><td style="color:var(--danger);">${(totalAmount * 0.10).toLocaleString()} د.ع</td>`;
            tbody.appendChild(tr);
        });
    }
}

window.exportAgentsSummary = function() {
    const data = appData.users.filter(u => u.role === 'agent').map(u => {
        const userReceipts = appData.receipts.filter(r => r.userId === u.id);
        const total = userReceipts.reduce((s, r) => s + r.amount, 0);
        return { "اسم المخول": u.name, "عدد الوصولات": userReceipts.length, "المبلغ": total, "النسبة": total * 0.10 };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.writeFile(wb, "Summary.xlsx");
}

window.exportAllData = function() {
    // تصدير الكل بترتيب تصاعدي أيضاً
    appData.receipts.sort((a, b) => a.receiptNum - b.receiptNum);
    
    const data = appData.receipts.map(r => {
        const u = appData.users.find(u => u.id === r.userId);
        // إضافة نوع المخول للتصدير
        const typeLabel = u && u.agentType === 'friday_prayer' ? 'صلاة جمعة' : 'مخول عادي';

        return { 
            "المخول": u ? u.name : r.userName, 
            "نوع المخول": typeLabel, // هذا هو التعديل المطلوب
            "الوصل": r.receiptNum, 
            "المساهم": r.donorName, 
            "المبلغ": r.amount, 
            "التاريخ": r.date, 
            "القاطع": r.sector 
        };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AllData");
    XLSX.writeFile(wb, "AllData.xlsx");
}
