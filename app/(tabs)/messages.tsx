import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, Image, StyleSheet, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from '../../lib/supabase';

export default function Messages() {
  const [session, setSession] = useState<any>(null);
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [users, setUsers] = useState<any[]>([]); // For search
  const [showNewModal, setShowNewModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
        if(data.session) {
            setSession(data.session);
            loadConversations(data.session.user.id);
        }
    });
  }, []);

  useEffect(() => {
      if(selectedConv) {
          loadMessages(selectedConv.id);
          const channel = supabase.channel('chat').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}`}, (payload) => {
              setMessages(prev => [...prev, payload.new]);
              setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
          }).subscribe();
          return () => { supabase.removeChannel(channel); };
      }
  }, [selectedConv]);

  const loadConversations = async (userId: string) => {
      const { data } = await supabase.from('conversations')
        .select(`*, landlord:profiles!landlord_id(*), tenant:profiles!tenant_id(*)`)
        .or(`landlord_id.eq.${userId},tenant_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      
      const formatted = (data || []).map((c: any) => ({
          ...c,
          otherUser: c.landlord_id === userId ? c.tenant : c.landlord
      }));
      setConversations(formatted);
  };

  const loadMessages = async (convId: string) => {
      const { data } = await supabase.from('messages').select('*').eq('conversation_id', convId).order('created_at', {ascending: true});
      setMessages(data || []);
      setTimeout(() => flatListRef.current?.scrollToEnd(), 100);
  };

  const sendMessage = async (imgUrl?: string) => {
      if (!text.trim() && !imgUrl) return;
      const msg = {
          conversation_id: selectedConv.id,
          sender_id: session.user.id,
          content: text,
          type: imgUrl ? 'image' : 'text',
          file_url: imgUrl || null
      };
      setText('');
      await supabase.from('messages').insert(msg);
      await supabase.from('conversations').update({updated_at: new Date()}).eq('id', selectedConv.id);
  };

  const pickImage = async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5 });
      if (!res.canceled) {
          const file = res.assets[0];
          const path = `${session.user.id}/${Date.now()}.jpg`;
          await supabase.storage.from('chat-attachments').upload(path, decode(file.base64!), { contentType: 'image/jpeg' });
          const { data } = supabase.storage.from('chat-attachments').getPublicUrl(path);
          sendMessage(data.publicUrl);
      }
  };

  const searchUsers = async (query: string) => {
      if(query.length < 2) return;
      const { data } = await supabase.from('profiles').select('*').ilike('last_name', `%${query}%`).neq('id', session.user.id).limit(10);
      setUsers(data || []);
  };

  const startConversation = async (user: any) => {
      // Check existing
      const { data: exist } = await supabase.from('conversations').select('*').or(`and(landlord_id.eq.${session.user.id},tenant_id.eq.${user.id}),and(landlord_id.eq.${user.id},tenant_id.eq.${session.user.id})`).maybeSingle();
      if (exist) {
          setSelectedConv({...exist, otherUser: user});
      } else {
          // Create
          const isMeLandlord = false; // Simplified for demo, ideally check profile.role
          const { data: newConv } = await supabase.from('conversations').insert({
              landlord_id: user.role === 'landlord' ? user.id : session.user.id,
              tenant_id: user.role === 'tenant' ? user.id : session.user.id
          }).select().single();
          if (newConv) setSelectedConv({...newConv, otherUser: user});
      }
      setShowNewModal(false);
  };

  if (selectedConv) {
      return (
          <SafeAreaView style={{flex:1, backgroundColor:'white'}}>
              <View style={styles.chatHeader}>
                  <TouchableOpacity onPress={() => setSelectedConv(null)}><Ionicons name="arrow-back" size={24} /></TouchableOpacity>
                  <Text style={styles.headerTitle}>{selectedConv.otherUser?.first_name} {selectedConv.otherUser?.last_name}</Text>
                  <View style={{width:24}}/>
              </View>
              <FlatList
                  ref={flatListRef}
                  data={messages}
                  keyExtractor={i => i.id}
                  renderItem={({item}) => {
                      const isMe = item.sender_id === session.user.id;
                      return (
                          <View style={[styles.msgBubble, isMe ? styles.msgMe : styles.msgOther]}>
                              {item.type === 'image' ? (
                                  <Image source={{uri: item.file_url}} style={{width:200, height:200, borderRadius:8}} />
                              ) : (
                                  <Text style={isMe ? styles.textMe : styles.textOther}>{item.content}</Text>
                              )}
                          </View>
                      );
                  }}
              />
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                  <View style={styles.inputBar}>
                      <TouchableOpacity onPress={pickImage}><Ionicons name="image-outline" size={24} color="#666" /></TouchableOpacity>
                      <TextInput style={styles.input} value={text} onChangeText={setText} placeholder="Message..." />
                      <TouchableOpacity onPress={() => sendMessage()}><Ionicons name="send" size={24} color="black" /></TouchableOpacity>
                  </View>
              </KeyboardAvoidingView>
          </SafeAreaView>
      );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <TouchableOpacity onPress={() => setShowNewModal(true)}><Ionicons name="create-outline" size={24} /></TouchableOpacity>
      </View>
      <FlatList 
          data={conversations}
          keyExtractor={i => i.id}
          renderItem={({item}) => (
              <TouchableOpacity onPress={() => setSelectedConv(item)} style={styles.convItem}>
                  <View style={styles.avatar}><Text style={{color:'white'}}>{item.otherUser?.first_name?.[0]}</Text></View>
                  <View style={{flex:1}}>
                      <Text style={styles.convName}>{item.otherUser?.first_name} {item.otherUser?.last_name}</Text>
                      <Text numberOfLines={1} style={styles.convPreview}>Click to view chat</Text>
                  </View>
              </TouchableOpacity>
          )}
      />
      <Modal visible={showNewModal} animationType="slide">
          <SafeAreaView style={{flex:1}}>
              <View style={styles.header}><Text style={styles.headerTitle}>New Chat</Text><TouchableOpacity onPress={() => setShowNewModal(false)}><Text>Close</Text></TouchableOpacity></View>
              <TextInput style={styles.searchBar} placeholder="Search user..." onChangeText={searchUsers} />
              <FlatList data={users} keyExtractor={i => i.id} renderItem={({item}) => (
                  <TouchableOpacity onPress={() => startConversation(item)} style={styles.userItem}>
                      <Text>{item.first_name} {item.last_name} ({item.role})</Text>
                  </TouchableOpacity>
              )} />
          </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: 'bold' },
  convItem: { flexDirection: 'row', padding: 15, borderBottomWidth: 1, borderColor: '#eee', gap: 15 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'black', alignItems: 'center', justifyContent: 'center' },
  convName: { fontWeight: 'bold', fontSize: 16 },
  convPreview: { color: '#666' },
  chatHeader: { flexDirection: 'row', padding: 15, alignItems: 'center', borderBottomWidth: 1, borderColor: '#eee', justifyContent:'space-between' },
  msgBubble: { padding: 10, borderRadius: 12, marginVertical: 5, marginHorizontal: 15, maxWidth: '80%' },
  msgMe: { backgroundColor: 'black', alignSelf: 'flex-end' },
  msgOther: { backgroundColor: '#f0f0f0', alignSelf: 'flex-start' },
  textMe: { color: 'white' },
  textOther: { color: 'black' },
  inputBar: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderColor: '#eee', alignItems: 'center', gap: 10 },
  input: { flex: 1, backgroundColor: '#f0f0f0', padding: 10, borderRadius: 20 },
  searchBar: { margin: 15, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 10 },
  userItem: { padding: 15, borderBottomWidth: 1, borderColor: '#eee' }
});