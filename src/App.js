import { useEffect, useState, useRef } from "react";
import { db } from "./firebase";
import { doc, updateDoc, onSnapshot, getDoc } from "firebase/firestore";
import Auth from "./Auth";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import html2canvas from "html2canvas";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { getDocs, collection } from "firebase/firestore";
import { setDoc } from "firebase/firestore";
import logoEditor from './assets/logo1.png';
import logoLector from './assets/logo2.png';
import { FaArrowUp, FaArrowDown, FaTrash, FaEye, FaEyeSlash } from "react-icons/fa";
import { FaBroom } from "react-icons/fa6";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

function App() {
    const [datos, setDatos] = useState([]);
    const graficaPastelRef = useRef(null);
    const [mostrarModalRecursos, setMostrarModalRecursos] = useState(false);
    const [filaSeleccionada, setFilaSeleccionada] = useState(null);
    const [esInvitado, setEsInvitado] = useState(false);
    const CORREO_INVITADO = "visitante@fbgroup.com"; 

    const descargarGraficaPastel = () => {
        if (graficaPastelRef.current) {
            html2canvas(graficaPastelRef.current).then((canvas) => {
                const link = document.createElement("a");
                link.download = `grafica_pastel_${new Date().toISOString().split("T")[0]}.png`;
                link.href = canvas.toDataURL();
                link.click();
            });
        }
    };
    const [user, setUser] = useState(null);
    const [checkingAuth, setCheckingAuth] = useState(true);
    const [modoLector, setModoLector] = useState(false);
    const [busqueda, setBusqueda] = useState("");
    const [mesSeleccionado, setMesSeleccionado] = useState("");
    const [resumen, setResumen] = useState({
        total: 0,
        detalles: [],
        actividadesPorDia: [],
        porActividad: [],
        osTotal: null,
        restante: null
    });
    const [anoSeleccionado, setAnoSeleccionado] = useState("");
    const [anosDisponibles, setAnosDisponibles] = useState([]);
    const [anoA, setAnoA] = useState("2024");
    const [anoB, setAnoB] = useState("2025");
    const [verComparativa, setVerComparativa] = useState(false);
    const [datosA, setDatosA] = useState([]);
    const [datosB, setDatosB] = useState([]);
    const [osPorAno, setOsPorAno] = useState({});
    // NUEVO: límites y tipos permitidos
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
    const ALLOWED_MIME = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel"
    ];
    const ALLOWED_EXT = [".pdf", ".png", ".jpg", ".jpeg", ".xls", ".xlsx"];

    const docRef = anoSeleccionado ? doc(db, "tablas", anoSeleccionado) : null;

    const campos = [
        "actividad", "descripcion", "lugar", "fecha",
        "os", "egreso", "estatus operativo", "estatus administrativo", "hes", "factura"
    ];

    const columnasOcultas = ["os", "egreso", "estatus operativo", "estatus administrativo", "hes", "factura"];

    const camposAUsar = esInvitado
        ? campos.filter(c => !columnasOcultas.includes(c))
        : campos;

    useEffect(() => {
        if (!user && !modoLector) return;
        if (!anoSeleccionado) return; // <-- evita crear referencias inválidas

        const docRefLocal = doc(db, "tablas", anoSeleccionado);
        const unsuscribe = onSnapshot(docRefLocal, (docSnap) => {
            if (docSnap.exists()) {
                setDatos(docSnap.data().registros || []);
            } else {
                setDatos([]);
            }
        });
        return () => unsuscribe();
    }, [anoSeleccionado, user, modoLector]);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (modoLector && mesSeleccionado) calcularResumenPorMes(mesSeleccionado);
    }, [datos]);

    useEffect(() => {
    if (!user && !modoLector) return;

    const cargarAnos = async () => {
        try {
            const coleccion = await getDocs(collection(db, "tablas"));
            const anos = coleccion.docs.map(doc => doc.id).sort(); // orden alfabético/numerico ascendente
            setAnosDisponibles(anos);

            // Selección por defecto:
            // - Si existe el año actual en Firestore, seleccionarlo
            // - Sino, seleccionar el mayor año disponible (último de la lista ordenada)
            const yearNow = new Date().getFullYear();
            const yearNowStr = String(yearNow);

            if (anos.includes(yearNowStr)) {
                setAnoSeleccionado(yearNowStr);
            } else if (anos.length > 0) {
                // elegir el mayor año disponible
                const mayor = anos[anos.length - 1];
                setAnoSeleccionado(mayor);
            } else {
                // sin años, opcional: dejar vacío o fallback a current year
                setAnoSeleccionado(yearNowStr);
            }
        } catch (e) {
            console.error("Error al cargar años disponibles:", e);
        }
    };

    cargarAnos();
}, [user, modoLector]);

    useEffect(() => {
        const auth = getAuth();
        const unsub = onAuthStateChanged(auth, async (usuarioActual) => {
            if (usuarioActual) {
                const correo = usuarioActual.email;
                const rolRef = doc(db, "roles", correo);

                const rolSnap = await getDoc(rolRef);
                if (rolSnap.exists()) {
                    const rol = rolSnap.data().rol;
                    if (rol === "editor") {
                        setUser(usuarioActual);
                        setModoLector(false);
                    } else if (rol === "lector") {
                        setUser(null);
                        setModoLector(true);

                        if (usuarioActual.email === CORREO_INVITADO) {
                            setEsInvitado(true);
                        } else {
                            setEsInvitado(false);
                        }
                    } else {
                        alert("Rol no reconocido.");
                        signOut(auth);
                    }
                } else {
                    alert("Este usuario no tiene rol asignado en Firestore.");
                    signOut(auth);
                }
            } else {
                setUser(null);
                setModoLector(false);
            }
            setCheckingAuth(false);
        });

        return () => unsub();
    }, []);

    const guardarDatos = async (nuevosDatos) => {
        if (!user || !docRef) return;
        await updateDoc(docRef, { registros: nuevosDatos });
    };

    const cargarComparacionLadoALado = async () => {
        if (anoA === anoB) {
            alert("No puedes comparar el mismo año contra si mismo.");
            return;
        }

        const [docA, docB] = await Promise.all([
            getDoc(doc(db, "tablas", anoA)),
            getDoc(doc(db, "tablas", anoB))
        ]);

        const registrosA = docA.exists() ? docA.data().registros || [] : [];
        const registrosB = docB.exists() ? docB.data().registros || [] : [];

        setDatosA(registrosA.slice(2)); // solo datos reales
        setDatosB(registrosB.slice(2));

        setOsPorAno({
            [anoA]: registrosA[1]?.os || "—",
            [anoB]: registrosB[1]?.os || "—"
        });

        setVerComparativa(true);
    };

    const handleChange = (index, campo, valor) => {
        const nuevosDatos = [...datos];
        nuevosDatos[index][campo] = valor;
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const agregarFila = () => {
        const nuevaFila = {
            actividad: "", descripcion: "", lugar: "", fecha: "",
            os: "", egreso: "", estatusadministrativo: "", estatusempresarial: "", hes: "", factura: "",
            archivos: []
        };
        const nuevosDatos = [...datos, nuevaFila];
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const limpiarFila = (index) => {
        const nuevosDatos = [...datos];
        const archivosPrevios = nuevosDatos[index].archivos; // NUEVO: conservar
        Object.keys(nuevosDatos[index]).forEach((campo) => {
            if (campo !== "archivos") { // NUEVO
                nuevosDatos[index][campo] = "";
            }
        });
        nuevosDatos[index].archivos = archivosPrevios || []; // NUEVO
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const eliminarFila = async (index) => {
        const confirmar = window.confirm("¿Estás seguro de que deseas eliminar esta fila?");
        if (!confirmar) return;

        // NUEVO: borrar adjuntos de Storage si los hubiera
        try {
            const adjuntos = datos[index]?.archivos || [];
            if (adjuntos.length > 0) {
                const storage = getStorage();
                await Promise.all(
                    adjuntos.map(a => deleteObject(storageRef(storage, a.path)).catch(() => null))
                );
            }
        } catch (e) {
            console.warn("Algunos archivos no pudieron eliminarse del storage.", e);
        }

        const nuevosDatos = [...datos];
        nuevosDatos.splice(index, 1);
        setDatos(nuevosDatos);
        await guardarDatos(nuevosDatos);
    };

    const moverFilaArriba = (index) => {
        if (index <= 2) return; // No mover encabezado ni fila OS
        const nuevosDatos = [...datos];
        const temp = nuevosDatos[index];
        nuevosDatos[index] = nuevosDatos[index - 1];
        nuevosDatos[index - 1] = temp;
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const moverFilaAbajo = (index) => {
        if (index >= datos.length - 1) return;
        const nuevosDatos = [...datos];
        const temp = nuevosDatos[index];
        nuevosDatos[index] = nuevosDatos[index + 1];
        nuevosDatos[index + 1] = temp;
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const cerrarSesion = () => {
        const auth = getAuth();
        signOut(auth);
        setUser(null);
        setModoLector(false);
    };

    // NUEVO: sanitizar nombres de archivo
    const sanitizeFileName = (name) => name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "_");

    // NUEVO: abrir/cerrar modal
    const abrirModalRecursos = (index) => {
        setFilaSeleccionada(index);
        setMostrarModalRecursos(true);
    };
    const cerrarModalRecursos = () => {
        setMostrarModalRecursos(false);
        setFilaSeleccionada(null);
    };

    // NUEVO: subir un archivo a Storage y actualizar Firestore (registros)
    const subirArchivo = async (realIndex, file) => {
        try {
            if (!user) return; // solo editor
            if (realIndex <= 1) return; // no aplica a encabezados/OS
            if (!file) return;

            // Validaciones
            const ext = "." + file.name.split(".").pop().toLowerCase();
            if (!ALLOWED_EXT.includes(ext) || !ALLOWED_MIME.includes(file.type)) {
                alert("Tipo de archivo no permitido. Solo PDF, PNG, JPG, XLS o XLSX.");
                return;
            }
            if (file.size > MAX_FILE_SIZE) {
                alert("El archivo excede los 5 MB.");
                return;
            }

            // Límite por actividad
            const adjuntosActuales = datos[realIndex]?.archivos || [];
            if (adjuntosActuales.length >= 5) {
                alert("Has alcanzado el máximo de 5 archivos para esta actividad.");
                return;
            }

            // Subida a Storage
            const storage = getStorage();
            const safeName = sanitizeFileName(file.name);
            const path = `attachments/${anoSeleccionado}/${realIndex}/${Date.now()}_${safeName}`;
            const ref = storageRef(storage, path);

            await uploadBytes(ref, file, { contentType: file.type });
            const url = await getDownloadURL(ref);

            // Metadatos a guardar en la fila
            const meta = {
                nombre: file.name,
                tipo: file.type,
                url,
                peso: file.size,
                fecha: new Date().toISOString(),
                path
            };

            // Actualizar estado y Firestore
            const nuevosDatos = [...datos];
            if (!nuevosDatos[realIndex].archivos) nuevosDatos[realIndex].archivos = [];
            nuevosDatos[realIndex].archivos = [...nuevosDatos[realIndex].archivos, meta];

            setDatos(nuevosDatos);
            await guardarDatos(nuevosDatos);
        } catch (e) {
            console.error(e);
            alert("Ocurrió un error al subir el archivo.");
        }
    };

    // NUEVO: eliminar un archivo (Storage + Firestore)
    const eliminarArchivoRecurso = async (realIndex, path) => {
        try {
            if (!user) return; // solo editor
            const confirmar = window.confirm("¿Eliminar este archivo definitivamente?");
            if (!confirmar) return;

            const storage = getStorage();
            await deleteObject(storageRef(storage, path));

            const nuevosDatos = [...datos];
            const arr = nuevosDatos[realIndex]?.archivos || [];
            nuevosDatos[realIndex].archivos = arr.filter(a => a.path !== path);

            setDatos(nuevosDatos);
            await guardarDatos(nuevosDatos);
        } catch (e) {
            console.error(e);
            alert("No se pudo eliminar el archivo.");
        }
    };

    // Función para ocultar/mostrar archivos al invitado
    const alternarVisibilidadArchivo = async (realIndex, path) => {
        const nuevosDatos = [...datos];
        const archivos = nuevosDatos[realIndex].archivos || [];

        const archivoIndex = archivos.findIndex(a => a.path === path);
        if (archivoIndex !== -1) {
            // Invertimos el valor: si era true pasa a false, y viceversa
            // Si 'oculto' no existía (undefined), !undefined es true (se oculta)
            archivos[archivoIndex].oculto = !archivos[archivoIndex].oculto;

            setDatos(nuevosDatos);
            await guardarDatos(nuevosDatos);
        }
    };

    const datosFiltrados = datos.filter((fila, index) => {
        if (index < 1) return false; // excluir encabezado
        if (!modoLector) return true;
        const texto = Object.values(fila).join(" ").toLowerCase();
        return texto.includes(busqueda.toLowerCase());
    });

    const exportarExcel = async () => {
    const workbook = new ExcelJS.Workbook();

    // Hoja 1: Tabla general
    const hojaTabla = workbook.addWorksheet("Tabla General");

    hojaTabla.columns = campos.map((campo) => ({
    header: campo === "lugar" ? "INSTITUCIÓN" : campo.toUpperCase(),
    key: campo,    
    width: 20
}));

    hojaTabla.getRow(1).font = { bold: true };

    datos.forEach((fila) => {
        hojaTabla.addRow(fila);
    });

    hojaTabla.eachRow((row) => {
        row.eachCell((cell) => {
            cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" }
            };
        });
    });

    // Solo si hay mes específico (no vacío y no "estado"), se crea hoja resumen
    if (mesSeleccionado && mesSeleccionado !== "estado") {
        const hojaResumen = workbook.addWorksheet(`Resumen ${mesSeleccionado}`);

        hojaResumen.columns = [
            { header: "Día", key: "día", width: 10 },
            { header: "Actividad", key: "actividad", width: 40 },
            { header: "Monto", key: "monto", width: 15 }
        ];

        hojaResumen.getRow(1).font = { bold: true };

        resumen.detalles.forEach((d) => {
            hojaResumen.addRow({
                dia: d.dia,
                actividad: d.actividad,
                monto: d.monto.toFixed(2)
            });
        });

        const filaTotal = hojaResumen.addRow([
            "",
            "TOTAL:",
            resumen.total.toFixed(2)
        ]);
        filaTotal.font = { bold: true };
        filaTotal.getCell(2).alignment = { horizontal: "right" };

        hojaResumen.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" }
                };
            });
        });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
        new Blob([buffer]),
        mesSeleccionado
            ? `datos_completos_${mesSeleccionado}_${anoSeleccionado}.xlsx`
            : `tabla_general_${anoSeleccionado}.xlsx`
    );
};

    const exportarPDF = async () => {
    const docPDF = new jsPDF({ orientation: "landscape" });

    // Encabezado de la tabla general
    const encabezado = campos.map((c) => {
    if (c === "lugar") return "INSTITUCIÓN";
    return datos[0]?.[c] || c.toUpperCase();
});
    const cuerpo = datos.slice(1).map((fila) => campos.map((campo) => fila[campo]));

    // Tabla general
    autoTable(docPDF, {
        head: [encabezado],
        body: cuerpo,
        margin: { top: 20 }
    });

    const finalY = docPDF.lastAutoTable.finalY || 30;

    // Si no hay mes seleccionado, solo exporta la tabla
    if (!mesSeleccionado) {
        docPDF.save(`tabla_general_${anoSeleccionado}.pdf`);
        return;
    }

    // Si es "estado del contrato"
    if (mesSeleccionado === "estado") {
        const graficas = document.getElementById("graficas-container");
        if (graficas) {
            const canvas = await html2canvas(graficas, { scale: 2 });
            const imgData = canvas.toDataURL("image/png");
            docPDF.addImage(imgData, "PNG", 10, finalY + 10, 270, 100);
        }

        docPDF.save(`estado_contrato_${anoSeleccionado}.pdf`);
        return;
    }

    // Si se seleccionó un mes específico, añadir resumen y gráfica
    docPDF.setFontSize(14);
    docPDF.text(`Resumen de ${mesSeleccionado}`, 14, finalY + 20);
    docPDF.text(`Total gastado: $ ${resumen.total.toFixed(2)}`, 14, finalY + 30);

    const cuerpoResumen = resumen.detalles.map((d) => [
        d.dia,
        d.actividad,
        `$ ${d.monto.toFixed(2)}`
    ]);

    autoTable(docPDF, {
        head: [["Día", "Actividad", "Monto"]],
        body: cuerpoResumen,
        startY: finalY + 40
    });

    // Gráfica de barras
    const graficas = document.getElementById("graficas-container");
    if (graficas) {
  const canvas = await html2canvas(graficas, { scale: 2 });
  const imgData = canvas.toDataURL("image/png");
  const afterResumen = docPDF.lastAutoTable?.finalY || finalY + 60;

  // Asegurar que no pase el alto de la página
  const pageHeight = docPDF.internal.pageSize.getHeight();
const espacioNecesario = 100; // altura estimada de la gráfica

if (afterResumen + espacioNecesario > pageHeight) {
    docPDF.addPage();
    docPDF.addImage(imgData, "PNG", 10, 20, 250, 80); // comienzo desde arriba
} else {
    docPDF.addImage(imgData, "PNG", 10, afterResumen + 10, 250, 80);
} 
}

    docPDF.save(`resumen_${mesSeleccionado}_${anoSeleccionado}.pdf`);
};

    const calcularResumenPorMes = (mesNombre) => {
        const meses = {
            enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
            julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
        };

        const mesIndex = meses[mesNombre.toLowerCase()];
        if (mesIndex === undefined) return;

        let total = 0;
        const detalles = [];
        const actividadesPorDia = [];

        datos.forEach((fila, i) => {
            if (i < 2) return;

            const fechasTexto = fila.fecha;
            const egresoTexto = fila.egreso;
            const actividad = fila.actividad || "Sin actividad";

            if (!fechasTexto || !egresoTexto) return;

            const fechasSeparadas = fechasTexto.split(",").map(f => f.trim());

            const egresoNum = parseFloat(
                egresoTexto.toString().replace(/[^\d.-]/g, "").replace(",", ".")
            );
            if (isNaN(egresoNum)) return;

            let contieneMes = false;
            const dias = [];

            fechasSeparadas.forEach((textoFecha) => {
                let fecha = null;
                if (textoFecha.includes("/")) {
                    const [d, m, y] = textoFecha.split("/");
                    fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                } else if (textoFecha.includes("-")) {
                    fecha = new Date(textoFecha);
                }

                if (fecha && fecha.getMonth() === mesIndex) {
                    contieneMes = true;
                    dias.push(fecha.getDate());
                }
            });

            // Este bloque es nuevo y reemplaza el push individual por fecha
            if (contieneMes) {
                const diasTexto = dias.length > 1
                    ? dias.map(d => d).join(" y ")
                    : dias[0];

                actividadesPorDia.push({
                    name: `Día ${diasTexto}`,
                    monto: egresoNum
                });
            }


            if (contieneMes) {
                total += egresoNum;

                const diasTexto = dias.length > 1
                    ? dias.map(d => `Día ${d}`).join(" y ")
                    : `Día ${dias[0]}`;

                detalles.push({
                    dia: diasTexto,
                    monto: egresoNum,
                    actividad
                });
            }
        });

        // Obtener el monto del OS desde la fila 1
        const osTexto = datos[1]?.os || "0";
        const osMonto = parseFloat(osTexto.toString().replace(/[^\d.-]/g, "").replace(",", "."));
        const osValido = !isNaN(osMonto) && osMonto > 0;

        // Obtener el mes actual
        const hoy = new Date();
        const mesActual = hoy.getMonth() + 1;
        const anioActual = hoy.getFullYear();

        // Calcular total real de egresos hasta el mes actual

        let egresosHastaHoy = 0;

        for (let i = 2; i < datos.length; i++) {
            const fila = datos[i];
            const fechaTexto = fila.fecha;
            const egresoTexto = fila.egreso;

            if (!fechaTexto || !egresoTexto) continue;

            const fecha = new Date(fechaTexto);
            const hoy = new Date();

            // Validación: fecha válida y menor o igual a hoy
            if (!isNaN(fecha) && fecha <= hoy) {
                const egreso = parseFloat(
                    egresoTexto
                        .toString()
                        .replace(/\$/g, "")
                        .replace(/,/g, "")
                        .trim()
                );
                if (!isNaN(egreso)) {
                    egresosHastaHoy += egreso;
                }
            }
        }

        // Datos de gráfica pastel
        const pastelData = osValido
          ? [
              { name: "Gastado", value: egresosHastaHoy },
              { name: "Saldo restante", value: Math.max(osMonto - egresosHastaHoy, 0) }
            ]
          : [];

        setResumen({
            total,
            detalles,
            actividadesPorDia,
            porActividad: pastelData,
            osTotal: osValido ? osMonto : null,
            restante: osValido ? osMonto - egresosHastaHoy : null
        });       
    };

    const obtenerGastoRealHastaHoy = () => {
    const hoy = new Date();
    let total = 0;

    for (let i = 2; i < datos.length; i++) {
        const fila = datos[i];
        const fechasTexto = fila.fecha;
        const egresoTexto = fila.egreso;

        if (!fechasTexto || !egresoTexto) continue;

        const fechasSeparadas = fechasTexto.split(",").map(f => f.trim());

        let incluyeFechaValida = false;

        for (const textoFecha of fechasSeparadas) {
            let fecha = null;

            if (textoFecha.includes("/")) {
                const [d, m, y] = textoFecha.split("/");
                fecha = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
            } else if (textoFecha.includes("-")) {
                fecha = new Date(textoFecha);
            }

            if (fecha && !isNaN(fecha) && fecha <= hoy) {
                incluyeFechaValida = true;
                break; // Basta con una fecha válida para sumar el egreso
            }
        }

        if (incluyeFechaValida) {
            const egreso = parseFloat(
                egresoTexto.toString().replace(/[^\d.-]/g, "").replace(",", ".")
            );
            if (!isNaN(egreso)) {
                total += egreso;
            }
        }
    }

    return total;
    };

    const obtenerTotalPagado = () => {
        let total = 0;
        for (let i = 2; i < datos.length; i++) {
            const fila = datos[i];
            const estado = fila["estatus administrativo"];
            const egresoTexto = fila.egreso;

            if (estado === "Pagado" && egresoTexto) {
                const egreso = parseFloat(
                    egresoTexto.toString().replace(/[^\d.-]/g, "").replace(",", ".")
                );
                if (!isNaN(egreso)) {
                    total += egreso;
                }
            }
        }
        return total;
    };


    const exportarResumenExcel = async () => {
        const workbook = new ExcelJS.Workbook();
        const hoja = workbook.addWorksheet(`Resumen ${mesSeleccionado}`);

        hoja.columns = [
            { header: "Día", key: "día", width: 10 },
            { header: "Actividad", key: "actividad", width: 40 },
            { header: "Monto", key: "monto", width: 15 },
        ];

        // Encabezado con negrita
        hoja.getRow(1).font = { bold: true };

        // Datos
        resumen.detalles.forEach((d) => {
            hoja.addRow({
                dia: d.dia,
                actividad: d.actividad,
                monto: d.monto.toFixed(2),
            });
        });

        // Total
        const filaTotal = hoja.addRow([
            "",
            "TOTAL:",
            resumen.total.toFixed(2)
        ]);
        filaTotal.font = { bold: true };
        filaTotal.getCell(2).alignment = { horizontal: "right" };

        // Bordes para todo
        hoja.eachRow((row) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: "thin" },
                    left: { style: "thin" },
                    bottom: { style: "thin" },
                    right: { style: "thin" },
                };
            });
        });

        // Descargar archivo
        const buffer = await workbook.xlsx.writeBuffer();
        saveAs(new Blob([buffer]), `resumen_${mesSeleccionado}.xlsx`);
    };

    const exportarResumenPDF = async () => {
        const docPDF = new jsPDF();
        docPDF.setFontSize(14);
        docPDF.text(`Resumen de ${mesSeleccionado}`, 14, 20);
        docPDF.text(`Total gastado: $ ${resumen.total.toFixed(2)}`, 14, 30);

        const cuerpo = resumen.detalles.map((d) => [
            d.dia, d.actividad, `$ ${d.monto.toFixed(2)}`
        ]);

        autoTable(docPDF, {
            head: [["Día", "Actividad", "Monto"]],
            body: cuerpo,
            startY: 40
        });

        // Capturar el contenedor de las gráficas
        const graficas = document.getElementById("graficas-container");
        if (graficas) {
            const canvas = await html2canvas(graficas, { scale: 2 });
            const imgData = canvas.toDataURL("image/png");
            const finalY = docPDF.lastAutoTable.finalY || 60;
            docPDF.addImage(imgData, "PNG", 10, finalY + 10, 190, 100);
        }

        docPDF.save(`resumen_${mesSeleccionado}.pdf`);
    };

    const descargarGraficasPNG = async () => {
        const graficas = document.getElementById("graficas-container");
        if (!graficas) return;

        const canvas = await html2canvas(graficas, { scale: 2 });
        const enlace = document.createElement("a");
        enlace.href = canvas.toDataURL("image/png");
        enlace.download = `graficas_${mesSeleccionado}.png`;
        enlace.click();
    };

    if (checkingAuth) return <p style={{ padding: 20 }}>Cargando...</p>;

    if (!user && !modoLector) {
        return (
            <div style={{ padding: "20px" }}>
                <Auth onLogin={() => { }} />
            </div>
        );
    }

    if (modoLector && verComparativa && !esInvitado) {
        const totalA = datosA.reduce((acc, fila) => {
            const valor = parseFloat(
                fila.egreso
                    ?.toString()
                    .replace(/\$/g, "")
                    .replace(/,/g, "")
                    .trim()
            );
            return isNaN(valor) ? acc : acc + valor;
        }, 0);

        const totalB = datosB.reduce((acc, fila) => {
            const valor = parseFloat(
                fila.egreso
                    ?.toString()
                    .replace(/\$/g, "")
                    .replace(/,/g, "")
                    .trim()
            );
            return isNaN(valor) ? acc : acc + valor;
        }, 0);

        const gastoVsContrato = {};
        [anoA, anoB].forEach((ano, i) => {
            const total = i === 0 ? totalA : totalB;
            const osTexto = osPorAno[ano] || "";
            const montoInicial = parseFloat(
                osTexto.toString().replace(/\$/g, "").replace(/,/g, "").trim()
            );

            if (!isNaN(montoInicial)) {
                const diferencia = montoInicial - total;
                gastoVsContrato[ano] = {
                    montoInicial,
                    gasto: total,
                    diferencia,
                    tipo: diferencia >= 0 ? "ahorro" : "exceso"
                };
            } else {
                gastoVsContrato[ano] = null;
            }
        });

        return (
            <div className="p-6 space-y-6">
                <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg shadow mb-6">
                    <h2 className="text-2xl font-bold text-gray-800">
                        Comparativa de egresos: {anoA} vs {anoB}
                    </h2>
                    <button
                        onClick={() => setVerComparativa(false)}
                        className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition"
                    >
                        Volver
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {[{ ano: anoA, datos: datosA, total: totalA }, { ano: anoB, datos: datosB, total: totalB }].map(({ ano, datos, total }) => (
                        <div key={ano} className="bg-white shadow rounded-lg p-4">
                            <h3 className="text-xl font-semibold mb-2 text-gray-700">{ano}</h3>
                            <p className="text-sm mb-4 text-gray-600">
                                <strong>Monto inicial del contrato (OS):</strong> {osPorAno[ano]}
                            </p>
                            <table className="w-full text-sm border border-gray-200">
                                <thead className="bg-amber-400">
                                    <tr>
                                        <th className="px-3 py-2 border">Actividad</th>
                                        <th className="px-3 py-2 border">Descripción</th>
                                        <th className="px-3 py-2 border">Egreso ($)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {datos.map((fila, i) => {
                                        const limpio = parseFloat(
                                            fila.egreso
                                                ?.toString()
                                                .replace(/\$/g, "")
                                                .replace(/,/g, "")
                                                .trim()
                                        );
                                        return (
                                            <tr key={i} className="border-b">
                                                <td className="px-3 py-2 border">{fila.actividad}</td>
                                                <td className="px-3 py-2 border">{fila.descripcion}</td>
                                                <td className="px-3 py-2 border">
                                                    {isNaN(limpio)
                                                        ? "—"
                                                        : `$ ${limpio.toLocaleString("es-PE", {
                                                            minimumFractionDigits: 2,
                                                        })}`}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    <tr className="font-bold bg-gray-50">
                                        <td colSpan={2} className="px-3 py-2 border">Total</td>
                                        <td className="px-3 py-2 border">
                                            ${total.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                            {gastoVsContrato[ano] && (
                                <p
                                    className={`mt-4 font-semibold text-sm ${gastoVsContrato[ano].tipo === "ahorro"
                                            ? "text-green-600"
                                            : "text-red-600"
                                        }`}
                                >
                                    Se {gastoVsContrato[ano].tipo === "ahorro" ? "ahorró" : "gasto de más"}{" "}
                                    {Math.abs(gastoVsContrato[ano].diferencia).toLocaleString("es-PE", {
                                        style: "currency",
                                        currency: "USD",
                                    })}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-5 font-sans">
            {/* ENCABEZADO SUPERIOR */}
            <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg shadow mb-6">
                {/* Logo + texto de bienvenida */}
                <div className="flex items-center space-x-4">
                    <img
                        src={modoLector ? logoLector : logoEditor}
                        alt="Logo"
                        className="w-10 h-10 object-contain"
                    />
                    <h1 className="text-2xl font-bold text-gray-800">
                        Bienvenido, {user ? user.email : "Usuario"}
                    </h1>
                </div>

                {/* Botón cerrar sesión */}
                {(user || modoLector) && (
                    <button
                        onClick={cerrarSesion}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded transition"
                    >
                        Cerrar sesión
                    </button>
                )}
            </div>

            {modoLector && (
                <div className="flex flex-wrap items-center gap-4 mb-6">
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300 w-full sm:w-auto"
                    />

                    <button
                        onClick={exportarExcel}
                        className="bg-amber-300 hover:bg-amber-400 text-white px-4 py-2 rounded-md shadow transition"
                    >
                        Exportar Excel
                    </button>

                    <button
                        onClick={exportarPDF}
                        className="bg-amber-400 hover:bg-amber-500 text-white px-4 py-2 rounded-md shadow transition"
                    >
                        Exportar PDF
                    </button>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-4 mb-6">
                <label className="text-lg font-medium text-gray-700">Año:</label>
                <select
                    value={anoSeleccionado}
                    onChange={(e) => setAnoSeleccionado(e.target.value)}
                    className="px-3 py-2 border rounded-md shadow-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-700"
                >
                    {anosDisponibles.map((a) => (
                        <option key={a} value={a}>{a}</option>
                    ))}
                </select>

                {user && (
                    <button
                        onClick={async () => {
                            const nuevo = prompt("Ingresa el nuevo año (solo entre 2024 y 2030):");
                            const ano = parseInt(nuevo);

                            if (
                                isNaN(ano) ||
                                ano < 2024 ||
                                ano > 2030 ||
                                anosDisponibles.includes(nuevo)
                            ) {
                                alert("Por favor ingresa un año válido entre 2024 y 2030 que aún no exista.");
                                return;
                            }

                            const nuevaRef = doc(db, "tablas", nuevo);
                            await setDoc(nuevaRef, { registros: [] });
                            setAnosDisponibles((prev) => [...prev, nuevo]);
                            setAnoSeleccionado(nuevo);
                        }}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-md shadow-sm transition"
                    >
                        Crear nuevo año
                    </button>
                )}
            </div>

            <div className="overflow-x-auto rounded-lg shadow border border-gray-300 mb-6">
                <table className="min-w-full divide-y divide-gray-300 bg-white">
                    <thead className="bg-amber-400">
                        <tr>
                            {camposAUsar.map((campo, i) => (
                                <th
                                    key={i}
                                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase"
                                >
                                    {campo === "egreso" ? "EGRESO ($)" :
                                        campo === "lugar" ? "INSTITUCIÓN" :  
                                            datos[0]?.[campo] || campo.toUpperCase()}
                                </th>
                            ))}
                            {/* NUEVO: columna Recursos justo después de Factura */}
                            <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase">
                                Recursos
                            </th>
                            {user && (
                                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase">
                                    Acciones
                                </th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                        {datosFiltrados.map((fila, index) => {
                            const realIndex = datos.indexOf(fila);
                            return (
                                <tr key={realIndex} className="hover:bg-gray-50 transition">
                                    {camposAUsar.map((campo, i) => {
                                        let esEditable = false;
                                        if (user) {
                                            if (realIndex === 1 && campo === "os") {
                                                esEditable = true;
                                            } else if (realIndex > 1) {
                                                esEditable = true;
                                            }
                                        }

                                        return (
                                            <td key={i} className="px-4 py-2 text-sm text-gray-700">
                                                {campo === "estatus operativo" && user ? (
                                                    realIndex > 1 ? (
                                                        <select
                                                            value={fila[campo] ?? ""}
                                                            onChange={(e) => handleChange(realIndex, campo, e.target.value)}
                                                            className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        >
                                                            <option value="">Seleccione</option>
                                                            <option value="Aprobado">Aprobado</option>
                                                            <option value="Supervisado">Supervisado</option>
                                                            <option value="Ejecutado">Ejecutado</option>
                                                        </select>
                                                    ) : (
                                                        <span></span>
                                                    )
                                                ) : esEditable ? (
                                                    <input
                                                        value={fila[campo]}
                                                        onChange={(e) =>
                                                            handleChange(realIndex, campo, e.target.value)
                                                        }
                                                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                    />
                                                ) : (
                                                    <span className={realIndex === 1 ? "font-semibold text-gray-800" : ""}>
                                                        {fila[campo]}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}

                                    {/* NUEVO: Celda Recursos (después de Factura) */}
                                    <td className="px-4 py-2 text-sm text-gray-700">
                                        {realIndex > 1 ? (
                                            <div className="flex items-center gap-2">
                                                {!modoLector && user ? (
                                                    <>
                                                        <span className="text-gray-600">
                                                            ({(fila.archivos?.length || 0)})
                                                        </span>
                                                        <label className="bg-amber-400 hover:bg-amber-500 text-white px-3 py-1 rounded-md text-sm cursor-pointer">
                                                            Subir
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                accept={ALLOWED_EXT.join(",")}
                                                                onChange={(e) => {
                                                                    const file = e.target.files?.[0];
                                                                    if (file) subirArchivo(realIndex, file);
                                                                    e.target.value = "";
                                                                }}
                                                            />
                                                        </label>
                                                        <button
                                                            onClick={() => abrirModalRecursos(realIndex)}
                                                            className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm"
                                                        >
                                                            Ver
                                                        </button>
                                                    </>
                                                ) : (
                                                    <button
                                                        onClick={() => abrirModalRecursos(realIndex)}
                                                        className="bg-white border border-gray-300 hover:bg-gray-100 text-gray-700 px-3 py-1 rounded-md text-sm disabled:opacity-50"
                                                        disabled={!fila.archivos || fila.archivos.length === 0}
                                                        title={!fila.archivos || fila.archivos.length === 0 ? "Sin recursos" : ""}
                                                    >
                                                        Ver ({fila.archivos?.length || 0})
                                                    </button>
                                                )}
                                            </div>
                                        ) : (
                                            <span></span>
                                        )}
                                    </td>

                                    {/* Acciones (tu bloque existente, sin cambios de lógica) */}
                                    {user && realIndex > 1 && (
                                        <td className="px-4 py-2 flex items-center gap-2">
                                            <div className="flex flex-col gap-1 mr-2">
                                                <button
                                                    onClick={() => moverFilaArriba(realIndex)}
                                                    className="text-gray-600 hover:text-blue-600"
                                                    title="Subir fila"
                                                >
                                                    <FaArrowUp />
                                                </button>
                                                <button
                                                    onClick={() => moverFilaAbajo(realIndex)}
                                                    className="text-gray-600 hover:text-blue-600"
                                                    title="Bajar fila"
                                                >
                                                    <FaArrowDown />
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => limpiarFila(realIndex)}
                                                className="text-amber-500 hover:text-amber-600 text-xl"
                                                title="Limpiar fila"
                                            >
                                                <FaBroom />
                                            </button>
                                            <button
                                                onClick={() => eliminarFila(realIndex)}
                                                className="text-red-600 hover:text-red-700 text-xl"
                                                title="Eliminar fila"
                                            >
                                                <FaTrash />
                                            </button>
                                        </td>
                                    )}
                                    {user && realIndex <= 1 && <td className="px-4 py-2"></td>}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <br />
            {user && (
                <button
                    onClick={agregarFila}
                    className="mt-4 px-4 py-2 bg-orange-500 text-white rounded-md shadow hover:bg-orange-600 transition"
                >
                    Agregar Fila
                </button>
            )}

            {modoLector && !esInvitado && (
                <div className="mb-6 bg-gray-50 p-4 rounded-lg shadow flex flex-wrap gap-4 items-center">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Comparar egresos entre años:
                    </h2>
                    <select
                        value={anoA}
                        onChange={(e) => setAnoA(e.target.value)}
                        className="px-3 py-2 border rounded-md text-sm text-gray-700"
                    >
                        {anosDisponibles.map((a) => (
                            <option key={a}>{a}</option>
                        ))}
                    </select>
                    <select
                        value={anoB}
                        onChange={(e) => setAnoB(e.target.value)}
                        className="px-3 py-2 border rounded-md text-sm text-gray-700"
                    >
                        {anosDisponibles.map((b) => (
                            <option key={b}>{b}</option>
                        ))}
                    </select>
                    <button
                        onClick={cargarComparacionLadoALado}
                        className="px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 transition text-sm"
                    >
                        Ver comparativa
                    </button>
                </div>
            )}

            {/* Sección de indicadores para lector */}
            {modoLector && !esInvitado && (
                <div className="mt-10 bg-gray-50 p-6 rounded-lg shadow">
                    <h2 className="text-xl font-semibold mb-4 text-gray-800">
                        Resumen mensual de egresos
                    </h2>

                    <select
                        value={mesSeleccionado}
                        onChange={(e) => {
                            setMesSeleccionado(e.target.value);
                            if (e.target.value !== "estado") {
                                calcularResumenPorMes(e.target.value);
                            }
                        }}
                        className="px-3 py-2 border rounded-md text-sm text-gray-700 mb-4"
                    >
                        <option value="">Selecciona una opción</option>
                        <option value="estado">Estado del contrato</option>
                        {[
                            "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                            "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
                        ].map((mes, i) => (
                            <option key={i} value={mes}>{mes}</option>
                        ))}
                    </select>

                    {/* Vista: Estado del contrato */}
                    {mesSeleccionado === "estado" && (
                        (() => {
                            const osValor = parseFloat(
                                datos[1]?.os?.toString().replace(/[^\d.-]/g, "").replace(",", ".")
                            ) || 0;

                            const gastoReal = obtenerGastoRealHastaHoy();
                            const saldoRestante = Math.max(parseFloat((osValor - gastoReal).toFixed(2)), 0);
                            const totalPagado = obtenerTotalPagado();
                            const porPagar = Math.max(gastoReal - totalPagado, 0);

                            // calcular cómo mostrar la fecha en el título del Estado del contrato
                            const anioActual = new Date().getFullYear();
                            let displayFecha;
                            const anoSelNum = parseInt(anoSeleccionado, 10);

                            // si anoSeleccionado es un año válido y es anterior al año actual -> mostrar solo el año seleccionado
                            if (!isNaN(anoSelNum) && anoSelNum < anioActual) {
                                displayFecha = String(anoSelNum);
                            } else {
                                // si es el año actual o un año futuro -> mostrar fecha completa hoy
                                displayFecha = new Date().toLocaleDateString("es-PE");
                            }

                            return (
                                <div id="graficas-container" className="bg-white p-4 rounded-lg shadow mb-8">
                                    <h2 className="text-lg font-semibold mb-2 text-gray-800">
                                        Estado del contrato: ${osValor.toLocaleString("es-PE", { minimumFractionDigits: 2 })} - {displayFecha}
                                    </h2>

                                    <button
                                        onClick={descargarGraficaPastel}
                                        className="mb-4 bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded"
                                    >
                                        Descargar gráficas en PNG
                                    </button>

                                    <div ref={graficaPastelRef} className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-80 mb-4">
                                        {/* Gráfica 1: Gastado vs Saldo restante */}
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: "Gastado", value: gastoReal },
                                                        { name: "Saldo restante", value: saldoRestante }
                                                    ]}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    label
                                                >
                                                    <Cell fill="#f97316" />
                                                    <Cell fill="#10b981" />
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>

                                        {/* Gráfica 2: Pagado vs Por pagar */}
                                        <ResponsiveContainer>
                                            <PieChart>
                                                <Pie
                                                    data={[
                                                        { name: "Pagado", value: totalPagado },
                                                        { name: "Por pagar", value: porPagar }
                                                    ]}
                                                    dataKey="value"
                                                    nameKey="name"
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    label
                                                >
                                                    <Cell fill="#3b82f6" />
                                                    <Cell fill="#f59e0b" />
                                                </Pie>
                                                <Tooltip />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                                        {/* Indicadores de ejecución presupuestaria */}
                                        <div className="bg-gray-50 p-4 rounded-lg shadow">
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2">KPI: EJECUCIÓN PRESUPUESTARIA</h4>
                                            <p className="text-sm text-gray-800">
                                                <strong>Total gastado hasta hoy:</strong>{" "}
                                                ${gastoReal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-sm text-gray-800">
                                                <strong>Saldo restante:</strong>{" "}
                                                ${saldoRestante.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>

                                        {/* Indicadores de eventos por pagar */}
                                        <div className="bg-gray-50 p-4 rounded-lg shadow">
                                            <h4 className="text-sm font-semibold text-gray-700 mb-2">KPI: EVENTOS POR PAGAR</h4>
                                            <p className="text-sm text-gray-800">
                                                <strong>Eventos ejecutados pagados:</strong>{" "}
                                                ${totalPagado.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                                            </p>
                                            <p className="text-sm text-gray-800">
                                                <strong>Eventos ejecutados por pagar:</strong>{" "}
                                                ${porPagar.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()
                    )}

                    {/* Vista: Resumen mensual clásico */}
                    {mesSeleccionado && mesSeleccionado !== "estado" && (
                        <>
                            <p className="mb-4 text-gray-700 font-medium">
                                Total gastado en {mesSeleccionado}:{" "}
                                <span className="text-green-700 font-bold">
                                    $ {resumen.total.toFixed(2)}
                                </span>
                            </p>

                            <ul className="space-y-1 mb-4 text-sm text-gray-600">
                                {resumen.detalles.map((d, i) => (
                                    <p key={i}>
                                        <strong>{d.dia}:</strong> $ {d.monto.toLocaleString("es-PE", { minimumFractionDigits: 2 })} - Actividad: {d.actividad}
                                    </p>
                                ))}
                            </ul>

                            <div className="flex flex-wrap gap-4 mb-6">
                                <button
                                    onClick={descargarGraficasPNG}
                                    className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 text-sm"
                                >
                                    Descargar gráficas como PNG
                                </button>
                            </div>

                            {/* Gráficas */}
                            <div id="graficas-container" className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Gráfica de barras */}
                                <div className="bg-white rounded-lg shadow p-4">
                                    <h3 className="text-lg font-semibold mb-4 text-gray-800">Egresos por día</h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={resumen.actividadesPorDia}>
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip />
                                            <Legend />
                                            <Bar dataKey="monto" fill="#4f46e5" name="Monto" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
            {/* NUEVO: Modal de Recursos */}
            {/* NUEVO: Modal de Recursos */}
            {/* NUEVO: Modal de Recursos BLINDADO */}
            {mostrarModalRecursos && filaSeleccionada !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white w-full max-w-3xl rounded-lg shadow-lg p-6">
                        <div className="flex justify-between items-center mb-4 border-b pb-3">
                            <h3 className="text-xl font-bold text-gray-800">
                                Recursos de la actividad
                            </h3>
                            <button
                                onClick={cerrarModalRecursos}
                                className="text-gray-500 hover:text-red-500 text-2xl font-bold transition"
                                aria-label="Cerrar"
                            >
                                ✕
                            </button>
                        </div>

                        {(() => {
                            // 1. Obtenemos siempre la lista completa original
                            const listaCompleta = datos[filaSeleccionada]?.archivos || [];

                            // 2. Determinamos si el usuario actual es un EDITOR (no está en modo lector)
                            // Usamos !modoLector porque es más fiable que 'user' al cambiar de cuenta rápido.
                            const esEditor = !modoLector;

                            // 3. Decidimos qué lista vamos a renderizar
                            // Si es el "Invitado especial", filtramos los ocultos.
                            // Si es Editor (o cualquier otro lector), mostramos la lista completa.
                            const archivosARenderizar = esInvitado
                                ? listaCompleta.filter(a => !a.oculto)
                                : listaCompleta;


                            if (archivosARenderizar.length === 0) {
                                return (
                                    <div className="text-center py-8 text-gray-500">
                                        <p>No hay recursos disponibles para mostrar.</p>
                                    </div>
                                );
                            }

                            return (
                                <ul className="divide-y divide-gray-200 max-h-[60vh] overflow-y-auto pr-2">
                                    {archivosARenderizar.map((a, idx) => (
                                        // Aplicamos estilo gris si está oculto Y quien lo ve es el Editor
                                        <li key={idx} className={`py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${a.oculto && esEditor ? "bg-gray-100 opacity-75 rounded-md px-2" : ""}`}>

                                            {/* Lado izquierdo: Información */}
                                            <div className="min-w-0 flex items-center gap-3 flex-1">
                                                {/* Etiqueta "Oculto" SOLO para el Editor */}
                                                {esEditor && a.oculto && (
                                                    <span className="flex-shrink-0 bg-gray-600 text-white text-xs px-2 py-1 rounded font-medium uppercase tracking-wider" title="Este archivo no lo ve el invitado">
                                                        Oculto
                                                    </span>
                                                )}
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-800 truncate" title={a.nombre}>
                                                        {a.nombre}
                                                    </p>
                                                    <p className="text-xs text-gray-500 mt-0.5">
                                                        {a.tipo.split("/")[1]?.toUpperCase() || "ARCHIVO"} • {(a.peso / 1024).toFixed(1)} KB • {new Date(a.fecha).toLocaleString("es-PE")}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Lado derecho: Botones */}
                                            <div className="flex items-center gap-3 flex-shrink-0 w-full sm:w-auto justify-end">
                                                {/* Botón OJO (Solo si es Editor) */}
                                                {esEditor && (
                                                    <button
                                                        onClick={() => alternarVisibilidadArchivo(filaSeleccionada, a.path)}
                                                        className={`p-2 rounded-md border transition ${a.oculto ? "bg-gray-200 text-gray-600 border-gray-300" : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"}`}
                                                        title={a.oculto ? "Hacer visible para el invitado" : "Ocultar al invitado"}
                                                    >
                                                        {a.oculto ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                                                    </button>
                                                )}

                                                <a
                                                    href={a.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-medium shadow-sm transition flex items-center"
                                                >
                                                    Descargar
                                                </a>

                                                {/* Botón Eliminar (Solo si es Editor) */}
                                                {esEditor && (
                                                    <button
                                                        onClick={() => eliminarArchivoRecurso(filaSeleccionada, a.path)}
                                                        className="bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 px-4 py-2 rounded-md text-sm font-medium transition"
                                                    >
                                                        Eliminar
                                                    </button>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;