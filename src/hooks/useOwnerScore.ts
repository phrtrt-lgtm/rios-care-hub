import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScoreHistoryEntry {
  id: string;
  score_before: number;
  score_after: number;
  points_change: number;
  reason: string;
  created_at: string;
  charge_id: string | null;
}

export interface OwnerScoreData {
  currentScore: number;
  totalCharges: number;
  paidOnTime: number;
  paidEarly: number;
  paidLate: number;
  debitedFromReserve: number;
  history: ScoreHistoryEntry[];
  stars: number;
  starLabel: string;
}

const getStarsFromScore = (score: number): { stars: number; label: string } => {
  if (score >= 90) return { stars: 5, label: "Excelente" };
  if (score >= 75) return { stars: 4, label: "Muito Bom" };
  if (score >= 60) return { stars: 3, label: "Bom" };
  if (score >= 40) return { stars: 2, label: "Regular" };
  return { stars: 1, label: "Atenção" };
};

export const useOwnerScore = (ownerId?: string) => {
  return useQuery({
    queryKey: ["owner-score", ownerId],
    queryFn: async (): Promise<OwnerScoreData> => {
      if (!ownerId) throw new Error("Owner ID required");

      // Fetch current score from profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("payment_score")
        .eq("id", ownerId)
        .single();

      if (profileError) throw profileError;

      // Fetch score history
      const { data: history, error: historyError } = await supabase
        .from("owner_payment_scores")
        .select("*")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (historyError) throw historyError;

      // Fetch charges stats
      const { data: charges, error: chargesError } = await supabase
        .from("charges")
        .select("id, status, paid_at, due_date, debited_at")
        .eq("owner_id", ownerId);

      if (chargesError) throw chargesError;

      const totalCharges = charges?.length || 0;
      let paidOnTime = 0;
      let paidEarly = 0;
      let paidLate = 0;
      let debitedFromReserve = 0;

      charges?.forEach((charge) => {
        if (charge.debited_at) {
          debitedFromReserve++;
        } else if (charge.paid_at && charge.due_date) {
          const paidDate = new Date(charge.paid_at);
          const dueDate = new Date(charge.due_date);
          const diffDays = Math.floor((dueDate.getTime() - paidDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (diffDays >= 2) {
            paidEarly++;
          } else if (diffDays >= 0) {
            paidOnTime++;
          } else {
            paidLate++;
          }
        }
      });

      const currentScore = profile?.payment_score ?? 50;
      const { stars, label } = getStarsFromScore(currentScore);

      return {
        currentScore,
        totalCharges,
        paidOnTime,
        paidEarly,
        paidLate,
        debitedFromReserve,
        history: (history || []) as ScoreHistoryEntry[],
        stars,
        starLabel: label,
      };
    },
    enabled: !!ownerId,
  });
};

export const useUpdateOwnerScore = () => {
  const updateScore = async (
    ownerId: string,
    chargeId: string,
    reason: "early_payment" | "on_time_payment" | "late_payment" | "reserve_debit"
  ) => {
    // Get current score
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("payment_score")
      .eq("id", ownerId)
      .single();

    if (profileError) throw profileError;

    const currentScore = profile?.payment_score ?? 50;
    
    // Calculate points change
    let pointsChange = 0;
    switch (reason) {
      case "early_payment":
        pointsChange = 5;
        break;
      case "on_time_payment":
        pointsChange = 1;
        break;
      case "late_payment":
        pointsChange = -15;
        break;
      case "reserve_debit":
        pointsChange = -30;
        break;
    }

    const newScore = Math.max(0, Math.min(100, currentScore + pointsChange));

    // Record history
    const { error: historyError } = await supabase
      .from("owner_payment_scores")
      .insert({
        owner_id: ownerId,
        charge_id: chargeId,
        score_before: currentScore,
        score_after: newScore,
        points_change: pointsChange,
        reason,
      });

    if (historyError) throw historyError;

    // Update profile score
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ payment_score: newScore })
      .eq("id", ownerId);

    if (updateError) throw updateError;

    return newScore;
  };

  return { updateScore };
};
