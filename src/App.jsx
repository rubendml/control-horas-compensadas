import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import * as XLSX from 'xlsx';

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [fechas, setFechas] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [selectedFechaId, setSelectedFechaId] = useState('');
  const [ingreso, setIngreso] = useState('');
  const [salida, setSalida] = useState('');
  const [horasOtros, setHorasOtros] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);

  // Nuevo estado para el reporte de todos los usuarios (solo para rmonroyl)
  const [todosUsuarios, setTodosUsuarios] = useState([]);

  // Para edición
  const [editingId, setEditingId] = useState(null);
  const [editIngreso, setEditIngreso] = useState('');
  const [editSalida, setEditSalida] = useState('');
  const [editHorasOtros, setEditHorasOtros] = useState('');

  // Cerrar sesión al cerrar la pestaña
  useEffect(() => {
    const handleBeforeUnload = () => {
      supabase.auth.signOut();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Verificar sesión y manejar confirmación de correo
  useEffect(() => {
    const initApp = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const accessToken = urlParams.get('access_token');
      const refreshToken = urlParams.get('refresh_token');

      if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user || null);
      setLoading(false);
    };

    initApp();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
        setLoading(false);
      }
    );

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // Cargar datos del usuario autenticado y todos los usuarios (si es rmonroyl)
  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        // Cargar perfil del usuario actual
        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(prof);

        // Cargar fechas permitidas
        const { data: fech } = await supabase
          .from('fechas_permitidas')
          .select('*')
          .order('fecha', { ascending: true });
        setFechas(fech || []);

        // Cargar registros del usuario actual
        const { data: regs } = await supabase
          .from('registros_horas')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setRegistros(regs || []);

        // Cargar todos los usuarios y sus registros si es rmonroyl
        if (user.email === 'rmonroyl@cendoj.ramajudicial.gov.co') {
          const { data: todosLosUsuarios } = await supabase
            .from('profiles')
            .select('*');

          const { data: todosLosRegistros } = await supabase
            .from('registros_horas')
            .select('*');

          if (todosLosUsuarios && todosLosRegistros) {
            const usuariosConEstadisticas = todosLosUsuarios.map(usuario => {
              const registrosUsuario = todosLosRegistros.filter(reg => reg.user_id === usuario.id);
              const totalCompensadoUsuario = registrosUsuario.reduce((sum, r) => {
                return sum + calcularHoras(r.ingreso_real, r.salida_real) + (r.horas_otros_conceptos || 0);
              }, 0);

              const porcentajeAvanceUsuario = usuario.tipo_horas ?
                Math.min(100, (totalCompensadoUsuario / usuario.tipo_horas) * 100) : 0;
              const pendienteUsuario = usuario.tipo_horas ?
                Math.max(0, usuario.tipo_horas - totalCompensadoUsuario) : 0;
              const porcentajeFaltanteUsuario = 100 - porcentajeAvanceUsuario;

              return {
                ...usuario,
                totalCompensado: totalCompensadoUsuario,
                porcentajeAvance: porcentajeAvanceUsuario,
                pendiente: pendienteUsuario,
                porcentajeFaltante: porcentajeFaltanteUsuario
              };
            });

            setTodosUsuarios(usuariosConEstadisticas);
          }
        }
      } catch (err) {
        console.error('Error al cargar datos:', err.message);
      }
    };

    loadData();
  }, [user]);

  const calcularHoras = (ing, sal) => {
    let total = 0;
    if (ing && ing < '08:00') {
      const [h, m] = ing.split(':').map(Number);
      total += (8 * 60 - (h * 60 + m)) / 60;
    }
    if (sal && sal > '17:00') {
      const [h, m] = sal.split(':').map(Number);
      total += ((h * 60 + m) - 17 * 60) / 60;
    }
    return parseFloat(total.toFixed(2));
  };

  const totalCompensado = registros.reduce((sum, r) => {
    return sum + calcularHoras(r.ingreso_real, r.salida_real) + (r.horas_otros_conceptos || 0);
  }, 0);

  const pendiente = profile ? Math.max(0, profile.tipo_horas - totalCompensado) : 0;
  const porcentajeAvance = profile ? Math.min(100, (totalCompensado / profile.tipo_horas) * 100) : 0;
  const porcentajeFaltante = 100 - porcentajeAvance;

  // Mostrar celebración si se cumplió el objetivo - PARA TODOS LOS USUARIOS
  useEffect(() => {
    if (profile && pendiente <= 0 && totalCompensado > 0) {
      setShowCelebration(true);
      const timer = setTimeout(() => setShowCelebration(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [profile, pendiente, totalCompensado]);

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Error al iniciar sesión: ' + error.message);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;
    const nombre = e.target.nombre.value;
    const tipo_horas = parseInt(e.target.tipo_horas.value);

    if (password.length < 6) {
      alert('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          nombre,
          tipo_horas,
        },
      },
    });

    if (authError) {
      alert('Error al registrarse: ' + authError.message);
      return;
    }

    alert('¡Registro exitoso! Revisa tu correo para confirmar tu cuenta.');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFechaId) {
      setMensaje('Selecciona una fecha');
      return;
    }

    // VALIDACIÓN DE HORARIOS NO PERMITIDOS - PARA TODOS LOS USUARIOS
    const ingresoValido = ingreso && ingreso < '08:00';
    const salidaValida = salida && salida > '17:00';
    const tieneOtros = parseFloat(horasOtros) > 0;

    if (!ingresoValido && !salidaValida && !tieneOtros) {
      setMensaje('⚠️ El ingreso debe ser antes de las 8:00 AM o la salida después de las 5:00 PM para generar compensación.');
      return;
    }

    const { error } = await supabase.from('registros_horas').insert({
      user_id: user.id,
      fecha_id: selectedFechaId,
      ingreso_real: ingreso || null,
      salida_real: salida || null,
      horas_otros_conceptos: parseFloat(horasOtros) || 0,
    });

    if (error) {
      setMensaje('Error: ' + error.message);
    } else {
      setMensaje('Registro guardado');
      setIngreso('');
      setSalida('');
      setHorasOtros('');
      // Recargar datos
      const { data: newRegs } = await supabase
        .from('registros_horas')
        .select('*')
        .eq('user_id', user.id);
      setRegistros(newRegs || []);

      // Si es rmonroyl, recargar también los datos de todos los usuarios
      if (user.email === 'rmonroyl@cendoj.ramajudicial.gov.co') {
        const { data: todosLosUsuarios } = await supabase
          .from('profiles')
          .select('*');

        const { data: todosLosRegistros } = await supabase
          .from('registros_horas')
          .select('*');

        if (todosLosUsuarios && todosLosRegistros) {
          const usuariosConEstadisticas = todosLosUsuarios.map(usuario => {
            const registrosUsuario = todosLosRegistros.filter(reg => reg.user_id === usuario.id);
            const totalCompensadoUsuario = registrosUsuario.reduce((sum, r) => {
              return sum + calcularHoras(r.ingreso_real, r.salida_real) + (r.horas_otros_conceptos || 0);
            }, 0);

            const porcentajeAvanceUsuario = usuario.tipo_horas ?
              Math.min(100, (totalCompensadoUsuario / usuario.tipo_horas) * 100) : 0;
            const pendienteUsuario = usuario.tipo_horas ?
              Math.max(0, usuario.tipo_horas - totalCompensadoUsuario) : 0;
            const porcentajeFaltanteUsuario = 100 - porcentajeAvanceUsuario;

            return {
              ...usuario,
              totalCompensado: totalCompensadoUsuario,
              porcentajeAvance: porcentajeAvanceUsuario,
              pendiente: pendienteUsuario,
              porcentajeFaltante: porcentajeFaltanteUsuario
            };
          });

          setTodosUsuarios(usuariosConEstadisticas);
        }
      }
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingId) return;

    // VALIDACIÓN DE HORARIOS NO PERMITIDOS - PARA TODOS LOS USUARIOS
    const ingresoValido = editIngreso && editIngreso < '08:00';
    const salidaValida = editSalida && editSalida > '17:00';
    const tieneOtros = parseFloat(editHorasOtros) > 0;

    if (!ingresoValido && !salidaValida && !tieneOtros) {
      setMensaje('⚠️ El ingreso debe ser antes de las 8:00 AM o la salida después de las 5:00 PM para generar compensación.');
      return;
    }

    const { error } = await supabase
      .from('registros_horas')
      .update({
        ingreso_real: editIngreso || null,
        salida_real: editSalida || null,
        horas_otros_conceptos: parseFloat(editHorasOtros) || 0,
      })
      .eq('id', editingId);

    if (error) {
      setMensaje('Error al actualizar: ' + error.message);
    } else {
      setMensaje('Registro actualizado');
      setEditingId(null);
      setEditIngreso('');
      setEditSalida('');
      setEditHorasOtros('');
      const { data: newRegs } = await supabase
        .from('registros_horas')
        .select('*')
        .eq('user_id', user.id);
      setRegistros(newRegs || []);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este registro?')) return;

    const { error } = await supabase
      .from('registros_horas')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Error al eliminar: ' + error.message);
    } else {
      const { data: newRegs } = await supabase
        .from('registros_horas')
        .select('*')
        .eq('user_id', user.id);
      setRegistros(newRegs || []);
    }
  };

  const handleEdit = (registro) => {
    setEditingId(registro.id);
    setSelectedFechaId(registro.fecha_id);
    setEditIngreso(registro.ingreso_real || '');
    setEditSalida(registro.salida_real || '');
    setEditHorasOtros(registro.horas_otros_conceptos || 0);
  };

  // Exportar reporte a Excel (solo para rmonroyl@cendoj.ramajudicial.gov.co) - REPORTE GENERAL
  const exportToExcel = () => {
    if (!user || user.email !== 'rmonroyl@cendoj.ramajudicial.gov.co') return;

    const data = [
      ['Nombre', 'Objetivo (h)', 'Compensadas (h)', '% Avance', 'Faltantes (h)', '% Faltante']
    ];

    // Agregar todos los usuarios al reporte
    todosUsuarios.forEach(usuario => {
      data.push([
        usuario.nombre || '—',
        usuario.tipo_horas || '—',
        usuario.totalCompensado.toFixed(2),
        `${usuario.porcentajeAvance.toFixed(1)}%`,
        usuario.pendiente.toFixed(2),
        `${usuario.porcentajeFaltante.toFixed(1)}%`
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte General');
    XLSX.writeFile(workbook, `reporte_general_horas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // INDICADOR DE ÚLTIMA ACTUALIZACIÓN - PARA TODOS LOS USUARIOS
  const ultimaActualizacion = registros.length > 0
    ? new Date(registros[0].created_at).toLocaleString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
    : 'Nunca';

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'Inter, system-ui, sans-serif'
      }}>
        <p style={{ fontSize: '18px', color: '#1e40af' }}>Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        width: '100%',
        maxWidth: '1200px',
        margin: '60px auto 40px',
        padding: '32px',
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '32px', fontWeight: '700', color: '#1e40af', marginBottom: '12px' }}>
          Control de Horas Compensadas
        </h1>
        <p style={{ color: '#4b5563', fontSize: '16px', marginBottom: '32px' }}>
          Inicia sesión o regístrate para gestionar tus horas
        </p>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '60px',
          flexWrap: 'wrap',
          margin: '0 auto 32px'
        }}>
          <form onSubmit={handleLogin} style={{
            background: '#fff',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
            textAlign: 'left',
            width: '450px'
          }}>
            <h3 style={{ textAlign: 'center', marginBottom: '24px', color: '#1e40af', fontSize: '24px' }}>Iniciar Sesión</h3>
            <div style={{ marginBottom: '24px' }}>
              <input
                name="email"
                type="email"
                placeholder="Correo electrónico"
                required
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <input
                name="password"
                type="password"
                placeholder="Contraseña"
                required
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #d1d5db',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Iniciar Sesión
            </button>
          </form>

          <form onSubmit={handleSignUp} style={{
            background: '#f0f9ff',
            padding: '32px',
            borderRadius: '16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
            textAlign: 'left',
            width: '450px'
          }}>
            <h3 style={{ textAlign: 'center', marginBottom: '24px', color: '#3b82f6', fontSize: '24px' }}>Crear Cuenta</h3>
            <div style={{ marginBottom: '24px' }}>
              <input
                name="nombre"
                placeholder="Nombre completo"
                required
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #bae6fd',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <input
                name="email"
                type="email"
                placeholder="Correo institucional"
                required
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #bae6fd',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <input
                name="password"
                type="password"
                placeholder="Contraseña (mín. 6 caracteres)"
                required
                minLength="6"
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #bae6fd',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ marginBottom: '24px' }}>
              <select
                name="tipo_horas"
                required
                style={{
                  width: '100%',
                  padding: '16px',
                  border: '1px solid #bae6fd',
                  borderRadius: '12px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  backgroundColor: 'white'
                }}
              >
                <option value="">Selecciona tu objetivo de horas</option>
                <option value="32">32 horas</option>
                <option value="40">40 horas</option>
              </select>
            </div>
            <button
              type="submit"
              style={{
                width: '100%',
                padding: '16px',
                background: '#3b82f6',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Registrarse
            </button>
          </form>
        </div>

        <footer style={{
          textAlign: 'center',
          marginTop: '40px',
          color: '#6b7280',
          fontSize: '14px'
        }}>
          Derechos reservados - Creaciones Manotas
        </footer>
      </div>
    );
  }

  return (
    <div style={{
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '32px',
      fontFamily: 'Inter, system-ui, sans-serif',
      color: '#1f2937',
      textAlign: 'center',
      backgroundColor: '#f0f9ff',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center'
    }}>
      {/* CELEBRACIÓN ANIMADA - PARA TODOS LOS USUARIOS */}
      {showCelebration && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: 'rgba(255,255,255,0.95)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          animation: 'fadein 0.8s ease-in'
        }}>
          <div style={{
            textAlign: 'center',
            padding: '50px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '25px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            color: 'white',
            animation: 'bounce 1s infinite alternate'
          }}>
            <h2 style={{ fontSize: '42px', marginBottom: '20px', fontWeight: 'bold' }}>🎉 ¡FELICIDADES! 🎉</h2>
            <p style={{ fontSize: '24px', marginBottom: '15px' }}>¡Has completado tu objetivo!</p>
            <p style={{ fontSize: '20px' }}>{profile?.tipo_horas} horas compensadas alcanzadas</p>
            <div style={{
              marginTop: '20px',
              fontSize: '18px',
              background: 'rgba(255,255,255,0.2)',
              padding: '10px 20px',
              borderRadius: '10px'
            }}>
              Total compensado: <strong>{totalCompensado.toFixed(2)} horas</strong>
            </div>
          </div>
        </div>
      )}

      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '32px',
        flexWrap: 'wrap',
        gap: '16px',
        width: '100%',
        maxWidth: '1000px'
      }}>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: '#1e40af',
          margin: 0
        }}>
          ¡Hola, <span style={{ color: '#3b82f6' }}>{profile?.nombre || 'Usuario'}</span>!
        </h1>
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            color: '#ef4444',
            border: '1px solid #ef4444',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '16px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          Cerrar sesión
        </button>
      </header>

      {/* TABLA DE PROGRESO INDIVIDUAL - PARA TODOS LOS USUARIOS */}
      <section style={{
        marginBottom: '32px',
        background: '#fff',
        padding: '24px',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: '900px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '22px',
          fontWeight: '600',
          marginBottom: '20px',
          color: '#1e40af',
          textAlign: 'center'
        }}>
          Tu Progreso
        </h2>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '16px'
        }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f9ff' }}>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Nombre</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Objetivo (h)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Compensadas (h)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>% Avance</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Faltantes (h)</th>
              <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>% Faltante</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '12px', fontWeight: '600' }}>{profile?.nombre || '—'}</td>
              <td style={{ padding: '12px' }}>{profile?.tipo_horas || '—'}</td>
              <td style={{ padding: '12px' }}>{totalCompensado.toFixed(2)}</td>
              <td style={{
                padding: '12px',
                color: porcentajeAvance >= 100 ? '#10b981' : '#1d4ed8',
                fontWeight: '600'
              }}>
                {porcentajeAvance.toFixed(1)}%
              </td>
              <td style={{ padding: '12px' }}>{pendiente.toFixed(2)}</td>
              <td style={{
                padding: '12px',
                color: porcentajeFaltante > 50 ? '#ef4444' : '#f59e0c',
                fontWeight: '600'
              }}>
                {porcentajeFaltante.toFixed(1)}%
              </td>
            </tr>
          </tbody>
        </table>

        {/* INDICADOR DE ÚLTIMA ACTUALIZACIÓN - PARA TODOS */}
        <p style={{
          marginTop: '20px',
          fontSize: '14px',
          color: '#6b7280',
          fontStyle: 'italic',
          textAlign: 'center'
        }}>
          <strong>Última actualización:</strong> {ultimaActualizacion}
        </p>
      </section>

      {/* TABLA DE REPORTE GENERAL - SOLO PARA rmonroyl */}
      {user.email === 'rmonroyl@cendoj.ramajudicial.gov.co' && (
        <section style={{
          marginBottom: '32px',
          background: '#fff',
          padding: '24px',
          borderRadius: '16px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
          width: '100%',
          maxWidth: '1100px',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '22px',
            fontWeight: '600',
            marginBottom: '20px',
            color: '#1e40af',
            textAlign: 'center'
          }}>
            Reporte General de Todos los Usuarios
          </h2>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '16px',
              minWidth: '800px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f9ff' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Nombre</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Objetivo (h)</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Compensadas (h)</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>% Avance</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>Faltantes (h)</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #bfdbfe' }}>% Faltante</th>
                </tr>
              </thead>
              <tbody>
                {todosUsuarios.map(usuario => (
                  <tr key={usuario.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px' }}>{usuario.nombre || '—'}</td>
                    <td style={{ padding: '12px' }}>{usuario.tipo_horas || '—'}</td>
                    <td style={{ padding: '12px' }}>{usuario.totalCompensado.toFixed(2)}</td>
                    <td style={{
                      padding: '12px',
                      color: usuario.porcentajeAvance >= 100 ? '#10b981' : '#1d4ed8',
                      fontWeight: '600'
                    }}>
                      {usuario.porcentajeAvance.toFixed(1)}%
                    </td>
                    <td style={{ padding: '12px' }}>{usuario.pendiente.toFixed(2)}</td>
                    <td style={{
                      padding: '12px',
                      color: usuario.porcentajeFaltante > 50 ? '#ef4444' : '#f59e0c',
                      fontWeight: '600'
                    }}>
                      {usuario.porcentajeFaltante.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            onClick={exportToExcel}
            style={{
              marginTop: '20px',
              padding: '12px 24px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            📊 Exportar Reporte General a Excel
          </button>
        </section>
      )}

      {/* Formulario de registro/edición - CENTRADO */}
      <section style={{
        marginBottom: '36px',
        background: '#fff',
        padding: '32px',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.06)',
        width: '100%',
        maxWidth: '1000px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: '600',
          marginBottom: '24px',
          color: '#1e40af',
          textAlign: 'center'
        }}>
          {editingId ? 'Editar registro' : 'Registrar horas'}
        </h2>
        <form onSubmit={editingId ? handleUpdate : handleSubmit} style={{ textAlign: 'center' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '16px',
            marginBottom: '24px',
            flexWrap: 'wrap'
          }}>
            <div style={{ textAlign: 'left', minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '16px', fontWeight: '600' }}>Fecha</label>
              <select
                value={selectedFechaId}
                onChange={(e) => setSelectedFechaId(e.target.value)}
                required
                disabled={editingId}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  fontSize: '16px'
                }}
              >
                <option value="">Selecciona fecha</option>
                {fechas.map(f => (
                  <option key={f.id} value={f.id}>{f.fecha}</option>
                ))}
              </select>
            </div>
            <div style={{ textAlign: 'left', minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '16px', fontWeight: '600' }}>Ingreso real</label>
              <input
                type="time"
                value={editingId ? editIngreso : ingreso}
                onChange={(e) => editingId ? setEditIngreso(e.target.value) : setIngreso(e.target.value)}
                placeholder="Hora de ingreso"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  fontSize: '16px'
                }}
              />
            </div>
            <div style={{ textAlign: 'left', minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '16px', fontWeight: '600' }}>Salida real</label>
              <input
                type="time"
                value={editingId ? editSalida : salida}
                onChange={(e) => editingId ? setEditSalida(e.target.value) : setSalida(e.target.value)}
                placeholder="Hora de salida"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  fontSize: '16px'
                }}
              />
            </div>
            <div style={{ textAlign: 'left', minWidth: '180px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '16px', fontWeight: '600' }}>Otros (h)</label>
              <input
                type="number"
                step="0.25"
                min="0"
                value={editingId ? editHorasOtros : horasOtros}
                onChange={(e) => editingId ? setEditHorasOtros(e.target.value) : setHorasOtros(e.target.value)}
                placeholder="Horas por otros conceptos"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '10px',
                  fontSize: '16px'
                }}
              />
            </div>
          </div>
          <button
            type="submit"
            style={{
              padding: '12px 28px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '18px',
              fontWeight: '600',
              cursor: 'pointer',
              marginRight: '12px'
            }}
          >
            {editingId ? 'Actualizar Registro' : 'Guardar Registro'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setIngreso('');
                setSalida('');
                setHorasOtros('');
              }}
              style={{
                padding: '12px 28px',
                background: '#6b7280',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                fontSize: '18px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>
          )}
          {mensaje && (
            <p style={{ marginTop: '16px', color: mensaje.includes('Error') ? '#ef4444' : '#1d4ed8', fontWeight: '500', fontSize: '16px' }}>
              {mensaje}
            </p>
          )}
        </form>
      </section>

      {/* Tabla de registros - CENTRADA */}
      <section style={{
        width: '100%',
        maxWidth: '1100px',
        textAlign: 'center'
      }}>
        <h2 style={{
          fontSize: '24px',
          fontWeight: '600',
          marginBottom: '24px',
          color: '#1e40af',
          textAlign: 'center'
        }}>
          Tus registros
        </h2>
        {registros.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center', fontSize: '16px' }}>
            No tienes registros aún.
          </p>
        ) : (
          <div style={{
            overflowX: 'auto',
            width: '100%',
            textAlign: 'center'
          }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '16px',
              minWidth: '800px'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f9ff' }}>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Fecha</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Ingreso real</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Salida real</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Otros</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Total día</th>
                  <th style={{ padding: '16px', borderBottom: '2px solid #bfdbfe' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => {
                  const fecha = fechas.find(f => f.id === r.fecha_id)?.fecha || '—';
                  const totalDia = calcularHoras(r.ingreso_real, r.salida_real) + (r.horas_otros_conceptos || 0);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '16px' }}>{fecha}</td>
                      <td style={{ padding: '16px' }}>{r.ingreso_real || '—'}</td>
                      <td style={{ padding: '16px' }}>{r.salida_real || '—'}</td>
                      <td style={{ padding: '16px' }}>{r.horas_otros_conceptos || 0}</td>
                      <td style={{ padding: '16px', fontWeight: '600', color: '#1d4ed8' }}>{totalDia.toFixed(2)}</td>
                      <td style={{ padding: '16px' }}>
                        <button
                          onClick={() => handleEdit(r)}
                          style={{
                            background: '#3b82f6',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            marginRight: '8px'
                          }}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          style={{
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: '6px',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pie de página - CENTRADO */}
      <footer style={{
        textAlign: 'center',
        marginTop: '50px',
        paddingTop: '24px',
        borderTop: '1px solid #e5e7eb',
        color: '#6b7280',
        fontSize: '14px',
        width: '100%',
        maxWidth: '800px'
      }}>
        Derechos reservados - Creaciones Manotas
      </footer>

      {/* Estilos para animaciones */}
      <style jsx>{`
        @keyframes fadein {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        @keyframes bounce {
          from { transform: translateY(0px); }
          to { transform: translateY(-20px); }
        }
      `}</style>
    </div>
  );
}

export default App;