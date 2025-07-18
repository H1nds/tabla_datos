import { useState } from "react";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { motion } from "framer-motion";

function Auth({ onLogin }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [errorMsg, setErrorMsg] = useState(""); // ?? nuevo estado para mostrar errores

    const auth = getAuth();

    const iniciarSesion = async (e) => {
        e.preventDefault();
        setErrorMsg(""); // limpia errores anteriores
        try {
            await signInWithEmailAndPassword(auth, email, password);
            onLogin(); // sesión iniciada correctamente
        } catch (error) {
            //Errores conocidos
            switch (error.code) {
                case "auth/user-not-found":
                    setErrorMsg("Usuario no encontrado. Verifica el correo.");
                    break;
                case "auth/wrong-password":
                    setErrorMsg("Contraseña incorrecta.");
                    break;
                case "auth/invalid-email":
                    setErrorMsg("Correo inválido.");
                    break;
                case "auth/invalid-credential":
                    setErrorMsg("Correo o contraseña incorrectos.");
                    break;
                default:
                    setErrorMsg("Ocurrió un error inesperado. Intenta nuevamente.");
            }
        }
    };

    return (
        <div
            className="min-h-screen flex items-center justify-center relative bg-gray-100"
            style={{
                backgroundImage: "url('/fondo.jpg')",
                backgroundSize: "cover",
                backgroundPosition: "center",
            }}
        >
            {/* Capa oscura para que el fondo no opaque el contenido */}
            <div className="absolute inset-0 bg-white bg-opacity-80 backdrop-blur-sm z-0" />

            <div className="relative z-10 w-full max-w-md bg-white p-8 rounded-lg shadow-xl">
                {/* Logos */}
                <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1 }}
                    className="flex justify-center items-center gap-6 mb-6"
                >
                    <img src="/logo1.png" alt="Logo 1" className="h-12 object-contain" />
                    <img src="/logo2.png" alt="Logo 2" className="h-12 object-contain" />
                </motion.div>

                <h2 className="text-3xl font-bold text-center text-gray-800 mb-6">Iniciar Sesión</h2>

                <form onSubmit={iniciarSesion} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 mb-1">Correo</label>
                        <input
                            type="email"
                            placeholder="correo@ejemplo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-gray-700 mb-1">Contraseña</label>
                        <input
                            type="password"
                            placeholder="********"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-400 transition"
                            required
                        />
                    </div>

                    {errorMsg && (
                        <div className="bg-red-100 text-red-700 px-4 py-2 rounded text-sm">
                            {errorMsg}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="w-full bg-orange-500 text-white py-2 rounded-md hover:bg-orange-600 transition"
                    >
                        Entrar
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Auth;
