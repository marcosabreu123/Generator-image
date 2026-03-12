import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Image as ImageIcon, ShieldAlert, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

interface UserStats {
  id: string;
  role: string;
  creationsCount: number;
}

export function AdminDashboard() {
  const [stats, setStats] = useState<UserStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Busca todos os perfis
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*');
        
      if (profilesError) throw profilesError;

      // Busca todas as criações para contar
      const { data: creations, error: creationsError } = await supabase
        .from('creations')
        .select('user_id');

      if (creationsError) throw creationsError;

      // Processa e cruza os dados
      const userStats: UserStats[] = (profiles || []).map(profile => {
        const userCreations = (creations || []).filter(c => c.user_id === profile.id).length;
        return {
          id: profile.id,
          role: profile.role || 'user',
          creationsCount: userCreations
        };
      });

      // Ordena por quem gerou mais imagens
      userStats.sort((a, b) => b.creationsCount - a.creationsCount);

      setStats(userStats);
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-950">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-12 bg-neutral-950">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
            <ShieldAlert className="text-emerald-500 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white">Dashboard Admin</h2>
            <p className="text-neutral-400">Visão geral de usuários e gerações</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6"
          >
            <div className="flex items-center gap-4 mb-2">
              <Users className="text-emerald-500 w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Total de Usuários</h3>
            </div>
            <p className="text-4xl font-black text-white">{stats.length}</p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6"
          >
            <div className="flex items-center gap-4 mb-2">
              <ImageIcon className="text-emerald-500 w-5 h-5" />
              <h3 className="text-lg font-bold text-white">Total de Imagens</h3>
            </div>
            <p className="text-4xl font-black text-white">
              {stats.reduce((acc, curr) => acc + curr.creationsCount, 0)}
            </p>
          </motion.div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden">
          <div className="p-6 border-b border-neutral-800">
            <h3 className="text-lg font-bold text-white">Usuários Cadastrados</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-neutral-950/50 text-neutral-400 text-sm">
                <tr>
                  <th className="p-4 font-medium">ID do Usuário</th>
                  <th className="p-4 font-medium">Role</th>
                  <th className="p-4 font-medium text-right">Imagens Geradas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {stats.map((user) => (
                  <tr key={user.id} className="hover:bg-neutral-800/50 transition-colors">
                    <td className="p-4 font-mono text-sm text-neutral-300">{user.id}</td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        user.role === 'admin' 
                          ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                          : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 text-right font-bold text-white">
                      {user.creationsCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
