import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Image, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const API = 'http://YOUR_LOCAL_IP:5000/api'; // Replace with your PC IP or ngrok URL

export default function App() {
  const [q, setQ] = useState('');
  const [mode, setMode] = useState('fast');
  const [res, setRes] = useState(null);
  const [load, setLoad] = useState(false);
  const [motiv, setMotiv] = useState('');
  const userId = 'user_' + Math.floor(Math.random() * 10000);
  const [stats, setStats] = useState({ deepRemaining: 2, advancedRemaining: 2 });

  useEffect(() => {
    fetchMotiv();
  }, []);

  const fetchMotiv = async () => {
    try {
      const r = await fetch(`${API}/motivation/${userId}`);
      const d = await r.json();
      setMotiv(`${d.greeting}\n${d.motivationalLine}`);
    } catch { setMotiv('Hello Student\nआज का दिन learning के लिए perfect है!'); }
  };

  const ask = async () => {
    if (!q.trim()) return Alert.alert('Enter a question');
    if (mode === 'deep' && stats.deepRemaining <= 0) return Alert.alert('Deep limit reached (2/day)');
    if (mode === 'advanced' && stats.advancedRemaining <= 0) return Alert.alert('Advanced limit reached (2/day)');
    
    setLoad(true);
    try {
      const r = await fetch(`${API}/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, mode, userId, includeImage: mode === 'advanced' })
      });
      const d = await r.json();
      if (r.status === 429) return Alert.alert('Limit Reached', d.error);
      setRes(d);
      setStats(s => ({ ...s, deepRemaining: d.remainingDeep ?? s.deepRemaining, advancedRemaining: d.remainingAdvanced ?? s.advancedRemaining }));
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setLoad(false); }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}><Text style={styles.motiv}>{motiv}</Text></View>
      <View style={styles.modeRow}>
        {['fast','deep','advanced'].map(m => (
          <TouchableOpacity key={m} style={[styles.modeBtn, mode===m && styles.active]} onPress={()=>setMode(m)}>
            <Ionicons name={m==='fast'?'flash':m==='deep'?'brain':'star'} size={22} color={mode===m?'#fff':'#555'}/>
            <Text style={[styles.modeTxt, mode===m && styles.activeTxt]}>{m.toUpperCase()}{m!=='fast'&&` (${stats[m+'Remaining']}/2)`}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.inputBox}>
        <TextInput style={styles.input} placeholder="Question here..." placeholderTextColor="#999" value={q} onChangeText={setQ} multiline/>
        <TouchableOpacity style={styles.send} onPress={ask} disabled={load}>
          {load ? <ActivityIndicator color="#fff"/> : <Ionicons name="send" size={22} color="#fff"/>}
        </TouchableOpacity>
      </View>
      {res && (
        <View style={styles.resBox}>
          <Text style={styles.resMode}>{res.mode.toUpperCase()} • {res.responseTime || ''}</Text>
          <Text style={styles.resTxt}>{res.answer}</Text>
          {res.image && <><Image source={{uri:res.image.url}} style={styles.img}/><Text style={styles.src}>Source: {res.image.source}</Text></>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, bg: '#f8f9fa' },
  header: { bg: '#2ecc71', padding: 20, paddingTop: 40 },
  motiv: { color: '#fff', fontSize: 16 },
  modeRow: { flexDirection: 'row', justifyContent: 'space-around', padding: 15, bg: '#fff' },
  modeBtn: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, marginHorizontal: 5, bg: '#f0f0f0' },
  active: { bg: '#2ecc71' },
  modeTxt: { marginTop: 5, fontSize: 11, color: '#555' },
  activeTxt: { color: '#fff', fontWeight: 'bold' },
  inputBox: { flexDirection: 'row', padding: 15, bg: '#fff', alignItems: 'flex-end' },
  input: { flex: 1, bg: '#f0f0f0', borderRadius: 20, padding: 12, fontSize: 16 },
  send: { bg: '#2ecc71', width: 45, height: 45, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  resBox: { margin: 15, padding: 15, bg: '#fff', borderRadius: 12 },
  resMode: { fontWeight: 'bold', color: '#2ecc71', marginBottom: 10 },
  resTxt: { fontSize: 16, lineHeight: 24, color: '#333' },
  img: { width: '100%', height: 250, borderRadius: 10, marginTop: 15 },
  src: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 5 }
});
