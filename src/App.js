import { useEffect, useState } from "react";
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
import { FaArrowUp, FaArrowDown } from "react-icons/fa";

function App() {
    const [datos, setDatos] = useState([]);
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
    const [anoSeleccionado, setAnoSeleccionado] = useState("2024");
    const [anosDisponibles, setAnosDisponibles] = useState([]);
    const [modoComparacion, setModoComparacion] = useState(false);
    const [anoA, setAnoA] = useState("2024");
    const [anoB, setAnoB] = useState("2025");
    const [comparacion, setComparacion] = useState([]);
    const [verComparativa, setVerComparativa] = useState(false);
    const [datosA, setDatosA] = useState([]);
    const [datosB, setDatosB] = useState([]);
    const [osPorAno, setOsPorAno] = useState({});

    const docRef = doc(db, "tablas", anoSeleccionado);

    const campos = [
        "actividad", "descripcion", "lugar", "fecha",
        "os", "egreso", "estatus", "hes", "factura"
    ];

    useEffect(() => {
        const docRef = doc(db, "tablas", anoSeleccionado);
        const unsuscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setDatos(docSnap.data().registros || []);
            } else {
                setDatos([]);
            }
        });
        return () => unsuscribe();
    }, [anoSeleccionado]);

    useEffect(() => {
        if (modoLector && mesSeleccionado) {
            calcularResumenPorMes(mesSeleccionado);
        }
    }, [datos]); // se actualiza cuando cambian los datos (al cambiar de año)

    useEffect(() => {
        const cargarAnos = async () => {
            const coleccion = await getDocs(collection(db, "tablas"));
            const anos = coleccion.docs.map(doc => doc.id);
            setAnosDisponibles(anos);
        };
        cargarAnos();
    }, []);

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
        if (user) {
            await updateDoc(docRef, { registros: nuevosDatos });
        }
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
            os: "", egreso: "", estatus: "", hes: "", factura: ""
        };
        const nuevosDatos = [...datos, nuevaFila];
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const limpiarFila = (index) => {
        const nuevosDatos = [...datos];
        Object.keys(nuevosDatos[index]).forEach((campo) => {
            nuevosDatos[index][campo] = "";
        });
        setDatos(nuevosDatos);
        guardarDatos(nuevosDatos);
    };

    const eliminarFila = (index) => {
        if (window.confirm("¿Estás seguro de que deseas eliminar esta fila?")) {
            const nuevosDatos = [...datos];
            nuevosDatos.splice(index, 1);
            setDatos(nuevosDatos);
            guardarDatos(nuevosDatos);
        }
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

    const ncargarComparacion = async () => {
        const [docA, docB] = await Promise.all([
            getDoc(doc(db, "tablas", anoA)),
            getDoc(doc(db, "tablas", anoB))
        ]);

        const datosA = docA.exists() ? docA.data().registros : [];
        const datosB = docB.exists() ? docB.data().registros : [];

        const resultado = datosA.map((filaA, i) => {
            const filaB = datosB[i] || {};
            return {
                actividad: filaA.actividad || filaB.actividad || "",
                descripcion: filaA.descripcion || filaB.descripcion || "",
                egresoA: filaA.egreso || "0",
                egresoB: filaB.egreso || "0"
            };
        });

        setComparacion(resultado);
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
        header: campo,
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
    const encabezado = campos.map((c) => datos[0]?.[c] || c.toUpperCase());
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
        const conteoPorActividad = {};

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

    if (modoLector && verComparativa) {
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
                            {campos.map((campo, i) => (
                                <th
                                    key={i}
                                    className="px-4 py-3 text-left text-sm font-semibold text-gray-700 uppercase"
                                >
                                    {campo === "egreso"
                                      ? "EGRESO ($)"
                                      : datos[0]?.[campo] || campo.toUpperCase()}

                                </th>
                            ))}
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
                                    {campos.map((campo, i) => {
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
                                                {esEditable ? (
                                                    <input
                                                        value={fila[campo]}
                                                        onChange={(e) =>
                                                            handleChange(realIndex, campo, e.target.value)
                                                        }
                                                        className="w-full px-2 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                    />
                                                ) : (
                                                    <span
                                                        className={
                                                            realIndex === 1 ? "font-semibold text-gray-800" : ""
                                                        }
                                                    >
                                                        {fila[campo]}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
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
                                                className="bg-amber-400 hover:bg-amber-500 text-white px-3 py-1 rounded-md text-sm"
                                            >
                                                Limpiar
                                            </button>
                                            <button
                                                onClick={() => eliminarFila(realIndex)}
                                                className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-md text-sm"
                                            >
                                                Eliminar
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

            {modoLector && (
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
            {modoLector && (
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

                        return (
                          <div id="graficas-container" className="bg-white p-4 rounded-lg shadow mb-8">
                            <h2 className="text-lg font-semibold mb-2 text-gray-800">
                              Estado del contrato: ${osValor.toLocaleString("es-PE", { minimumFractionDigits: 2 })} - {new Date().toLocaleDateString("es-PE")}
                            </h2>

                            <div className="w-full h-80 mb-4">
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
                            </div>

                            <p className="text-gray-700 text-base mb-1">
                              <strong>Total gastado hasta hoy:</strong>{" "}
                              ${gastoReal.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                            </p>

                            <p className="text-gray-700 text-base font-semibold">
                              <strong>Saldo restante:</strong>{" "}
                              ${saldoRestante.toLocaleString("es-PE", { minimumFractionDigits: 2 })}
                            </p>
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
        </div>
    );
}

export default App;