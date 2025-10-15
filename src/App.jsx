import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

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

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      setUser(data.session?.user || null);
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user || null);
      }
    );

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadData = async () => {
      try {
        const {  prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        setProfile(prof);

        const {  fech } = await supabase
          .from('fechas_permitidas')
          .select('*')
          .order('fecha', { ascending: true });
        setFechas(fech || []);

        const {  regs } = await supabase
          .from('registros_horas')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        setRegistros(regs || []);
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

  const pendiente = profile ? Math.max(0, profile.tipo_horas - totalCompensado).toFixed(2) : 0;

  const handleLogin = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert('Error: ' + error.message);
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
      const {  newRegs } = await supabase
        .from('registros_horas')
        .select('*')
        .eq('user_id', user.id);
      setRegistros(newRegs || []);
    }
  };

  if (!user) {
    return (
      <div style={{ 
        maxWidth: '480px', 
        margin: '80px auto 40px', 
        padding: '24px', 
        fontFamily: 'Inter, system-ui, sans-serif',
        textAlign: 'center'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>
          Control de Horas Compensadas
        </h1>
        <p style={{ color: '#4b5563', fontSize: '14px', marginBottom: '24px' }}>
          Inicia sesión para gestionar tus horas
        </p>
        <form onSubmit={handleLogin} style={{ 
          background: '#fff', 
          padding: '24px', 
          borderRadius: '12px', 
          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          textAlign: 'left'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <input
              name="email"
              placeholder="Correo electrónico"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ marginBottom: '16px' }}>
            <input
              name="password"
              type="password"
              placeholder="Contraseña"
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Iniciar Sesión
          </button>
        </form>
        <footer style={{ 
          textAlign: 'center', 
          marginTop: '32px', 
          color: '#6b7280', 
          fontSize: '13px' 
        }}>
          Derechos reservados - Creaciones Manotas
        </footer>
      </div>
    );
  }

  return (
    <div style={{ 
      maxWidth: '900px', 
      margin: '0 auto', 
      padding: '20px', 
      fontFamily: 'Inter, system-ui, sans-serif', 
      color: '#1f2937',
      textAlign: 'center',
      backgroundColor: '#f9fafb',
      minHeight: '100vh'
    }}>
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ 
          fontSize: '22px', 
          fontWeight: '700', 
          color: '#1e40af',
          margin: 0
        }}>
          ¡Hola, <span style={{ color: '#2563eb' }}>{profile?.nombre || 'Usuario'}</span>!
        </h1>
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            color: '#ef4444',
            border: '1px solid #ef4444',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          Cerrar sesión
        </button>
      </header>

      {/* Resumen visible */}
      <div style={{ 
        background: '#dbeafe', 
        padding: '20px', 
        borderRadius: '12px', 
        textAlign: 'center', 
        marginBottom: '28px', 
        border: '1px solid #bfdbfe',
        maxWidth: '600px',
        margin: '0 auto 28px'
      }}>
        <p style={{ margin: '6px 0', fontSize: '16px' }}>
          <strong>Objetivo:</strong> <span style={{ color: '#1e40af', fontWeight: '600' }}>{profile?.tipo_horas || '—'} horas</span>
        </p>
        <p style={{ margin: '6px 0', fontSize: '16px' }}>
          <strong>Compensadas:</strong> <span style={{ color: '#059669', fontWeight: '600' }}>{totalCompensado.toFixed(2)} h</span>
        </p>
        <p style={{ margin: '6px 0', fontSize: '18px', fontWeight: '700', color: pendiente > 0 ? '#d97706' : '#059669' }}>
          <strong>Faltan:</strong> {pendiente} h
        </p>
      </div>

      {/* Formulario */}
      <section style={{ 
        marginBottom: '32px', 
        background: '#fff', 
        padding: '20px', 
        borderRadius: '12px', 
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        maxWidth: '700px',
        margin: '0 auto 32px',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: '600', 
          marginBottom: '16px', 
          color: '#1e3a8a',
          textAlign: 'center'
        }}>
          Registrar horas
        </h2>
        <form onSubmit={handleSubmit} style={{ textAlign: 'center' }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', 
            gap: '12px', 
            marginBottom: '16px',
            justifyContent: 'center'
          }}>
            <select
              value={selectedFechaId}
              onChange={(e) => setSelectedFechaId(e.target.value)}
              required
              style={{
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                minWidth: '140px'
              }}
            >
              <option value="">Selecciona fecha</option>
              {fechas.map(f => (
                <option key={f.id} value={f.id}>{f.fecha}</option>
              ))}
            </select>
            <input
              type="time"
              value={ingreso}
              onChange={(e) => setIngreso(e.target.value)}
              placeholder="Ingreso"
              style={{
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                minWidth: '140px'
              }}
            />
            <input
              type="time"
              value={salida}
              onChange={(e) => setSalida(e.target.value)}
              placeholder="Salida"
              style={{
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                minWidth: '140px'
              }}
            />
            <input
              type="number"
              step="0.25"
              min="0"
              value={horasOtros}
              onChange={(e) => setHorasOtros(e.target.value)}
              placeholder="Otros (h)"
              style={{
                padding: '10px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '15px',
                minWidth: '140px'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              padding: '10px 24px',
              background: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Guardar Registro
          </button>
          {mensaje && (
            <p style={{ marginTop: '12px', color: mensaje.includes('Error') ? '#ef4444' : '#059669', fontWeight: '500' }}>
              {mensaje}
            </p>
          )}
        </form>
      </section>

      {/* Tabla de registros */}
      <section style={{ 
        maxWidth: '800px', 
        margin: '0 auto', 
        textAlign: 'center' 
      }}>
        <h2 style={{ 
          fontSize: '20px', 
          fontWeight: '600', 
          marginBottom: '16px', 
          color: '#1e3a8a',
          textAlign: 'center'
        }}>
          Tus registros
        </h2>
        {registros.length === 0 ? (
          <p style={{ color: '#6b7280', fontStyle: 'italic', textAlign: 'center' }}>
            No tienes registros aún.
          </p>
        ) : (
          <div style={{ 
            overflowX: 'auto', 
            width: '100%', 
            margin: '0 auto',
            textAlign: 'center'
          }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '14px',
              minWidth: '600px',
              margin: '0 auto'
            }}>
              <thead>
                <tr style={{ backgroundColor: '#f0f9ff' }}>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Fecha</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Ingreso</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Salida</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Otros</th>
                  <th style={{ padding: '12px', borderBottom: '2px solid #cbd5e1' }}>Total día</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => {
                  const fecha = fechas.find(f => f.id === r.fecha_id)?.fecha || '—';
                  const totalDia = calcularHoras(r.ingreso_real, r.salida_real) + (r.horas_otros_conceptos || 0);
                  return (
                    <tr key={r.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '12px' }}>{fecha}</td>
                      <td style={{ padding: '12px' }}>{r.ingreso_real || '—'}</td>
                      <td style={{ padding: '12px' }}>{r.salida_real || '—'}</td>
                      <td style={{ padding: '12px' }}>{r.horas_otros_conceptos || 0}</td>
                      <td style={{ padding: '12px', fontWeight: '600', color: '#059669' }}>{totalDia.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pie de página */}
      <footer style={{ 
        textAlign: 'center', 
        marginTop: '40px', 
        paddingTop: '20px', 
        borderTop: '1px solid #e5e7eb', 
        color: '#6b7280', 
        fontSize: '13px',
        maxWidth: '600px',
        margin: '40px auto 0'
      }}>
        Derechos reservados - Creaciones Manotas
      </footer>
    </div>
  );
}

export default App;
