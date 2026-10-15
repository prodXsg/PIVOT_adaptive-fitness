import { useEffect, useState } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { MobileFrame } from "@/components/pivot/MobileFrame";
import { BottomNav } from "@/components/pivot/BottomNav";
import { HomeScreen } from "@/components/pivot/HomeScreen";
import { CheckInScreen } from "@/components/pivot/CheckInScreen";
import { WorkoutIntentScreen, type ReadinessSnapshot } from "@/components/pivot/WorkoutIntentScreen";
import { WorkoutScreen } from "@/components/pivot/WorkoutScreen";
import { InsightsScreen } from "@/components/pivot/InsightsScreen";
import { ProfileScreen } from "@/components/pivot/ProfileScreen";
import { WelcomeScreen } from "@/components/pivot/WelcomeScreen";
import { AuthScreen } from "@/components/pivot/AuthScreen";
import { HowItWorksScreen } from "@/components/pivot/HowItWorksScreen";
import { AccountCreationScreen } from "@/components/pivot/AccountCreationScreen";
import { OTPScreen } from "@/components/pivot/OTPScreen";
import { toast } from "sonner";

type AppFlow = "hero" | "how-it-works" | "auth" | "account-creation" | "existing-user" | "otp" | "app";
type HomeFlow = "home" | "checkin" | "checkin-intent" | "workout" | "workout-preview";

function getInitialAppFlow(): AppFlow {
  try {
    const raw = localStorage.getItem("pivot_user_profile");
    if (raw && JSON.parse(raw)) return "app";
  } catch {}
  return "hero";
}

function getInitialHomeFlow(): HomeFlow {
  try {
    const state = localStorage.getItem("pivot_workout_state");
    const date = localStorage.getItem("pivot_workout_state_date");
    const today = new Date().toISOString().slice(0, 10);
    if (state === "WORKOUT_STARTED" && date === today) return "workout";
    if (state === "WORKOUT_GENERATED" && date === today) return "home";
    if (state === "WORKOUT_COMPLETED" && date === today) return "home";
  } catch {}
  return "home";
}

function PivotApp() {
  const {
    tab,
    setTab,
    setReturning,
    setWorkoutState,
    setTodayWorkout,
    setUserProfile,
    setHasGeneratedWorkout,
    clearExerciseStatuses,
    finalizeSessionQuality,
    incrementCompletedWorkouts,
    userProfile,
    hasGeneratedWorkout,
    workoutState,
    todayWorkout,
    completedWorkoutsCount,
  } = useApp();

  const [appFlow, setAppFlow] = useState<AppFlow>(getInitialAppFlow);
  const [homeFlow, setHomeFlow] = useState<HomeFlow>(getInitialHomeFlow);
  const [readinessDraft, setReadinessDraft] = useState<ReadinessSnapshot | null>(null);
  const [otpEmail, setOtpEmail] = useState("");
  const [isExistingUser, setIsExistingUser] = useState(false);

  const sliderLabel: "Get Started" | "I'm Back" | "Continue Workout" =
    workoutState === "WORKOUT_STARTED"
      ? "Continue Workout"
      : userProfile && (hasGeneratedWorkout || completedWorkoutsCount > 0)
      ? "I'm Back"
      : "Get Started";

  const handleHeroSlide = () => {
    setAppFlow(userProfile ? "app" : "how-it-works");
  };

  useEffect(() => {
    const handler = () => {
      try {
        [
          "pivot_welcome_seen",
          "pivot_onboarding_done",
          "pivot_user_profile",
          "pivot_has_generated_workout",
          "pivot_checkin_count",
          "pivot_last_checkin_date",
          "pivot_weekly_summaries_v1",
          "pivot_prefs_v1",
          "pivot_pending_user",
          "pivot_workout_state",
          "pivot_workout_state_date",
          "pivot_today_workout",
          "pivot_completed_exercises",
          "pivot_exercise_status_v1",
          "pivot_completed_workouts_count",
          "pivot_total_training_time",
          "pivot_last_workout_date",
          "pivot_last_workout_focus",
          "pivot_exercise_images_v1",
          "pivot_recent_exercises_v1",
          "pivot_recent_pivots_v1",
          "pivot_session_quality_v1",
          "pivot_adaptive_memory_v1",
          "pivot_total_pivots",
          "pivot_weekly_week_start",
          "pivot_weekly_completed",
          "pivot_skipped_exercises",
          "pivot_partial_exercises",
          "pivot_last_checkin_data",
          "pivot_history_v1",
        ].forEach((k) => localStorage.removeItem(k));
      } catch {}

      setUserProfile(null);
      setHasGeneratedWorkout(false);
      setWorkoutState("NO_WORKOUT");
      setTodayWorkout(null);
      clearExerciseStatuses();
      setAppFlow("hero");
      setHomeFlow("home");
      setOtpEmail("");
      setReadinessDraft(null);
      setTab("home");
    };
    window.addEventListener("pivot:reset-app", handler);
    return () => window.removeEventListener("pivot:reset-app", handler);
  }, [
    setUserProfile,
    setHasGeneratedWorkout,
    setWorkoutState,
    setTodayWorkout,
    clearExerciseStatuses,
    setTab,
  ]);

  if (appFlow === "hero") {
    return (
      <MobileFrame>
        <WelcomeScreen sliderLabel={sliderLabel} onSlideComplete={handleHeroSlide} />
      </MobileFrame>
    );
  }

  if (appFlow === "how-it-works") {
    return (
      <MobileFrame>
        <HowItWorksScreen onContinue={() => setAppFlow("auth")} />
      </MobileFrame>
    );
  }

  if (appFlow === "auth") {
    return (
      <MobileFrame>
        <AuthScreen
          onCreateAccount={() => setAppFlow("account-creation")}
          onExistingUser={(email) => {
            setOtpEmail(email);
            setIsExistingUser(false);
            try {
              localStorage.setItem("pivot_pending_user", JSON.stringify({ name: "", email }));
            } catch {}
            setAppFlow("otp");
          }}
          onEmailExists={(email) => {
            setOtpEmail(email);
            setIsExistingUser(true);
            try {
              localStorage.setItem("pivot_pending_user", JSON.stringify({ name: "", email }));
            } catch {}
            setAppFlow("otp");
          }}
        />
      </MobileFrame>
    );
  }

  if (appFlow === "account-creation") {
    return (
      <MobileFrame>
        <AccountCreationScreen
          onSubmit={(_name, email) => {
            setOtpEmail(email);
            setAppFlow("otp");
          }}
        />
      </MobileFrame>
    );
  }

  if (appFlow === "otp") {
    return (
      <MobileFrame>
        <OTPScreen email={otpEmail} onVerified={() => setAppFlow("app")} isExistingUser={isExistingUser} />
      </MobileFrame>
    );
  }

  const renderHomeFlow = () => {
    if (homeFlow === "checkin") {
      return (
        <CheckInScreen
          initialReadiness={readinessDraft}
          onBack={() => {
            setReadinessDraft(null);
            setHomeFlow("home");
          }}
          onReadinessComplete={(r) => {
            setReadinessDraft(r);
            setHomeFlow("checkin-intent");
          }}
        />
      );
    }

    if (homeFlow === "checkin-intent" && readinessDraft) {
      return (
        <WorkoutIntentScreen
          readiness={readinessDraft}
          onBack={() => setHomeFlow("checkin")}
          onComplete={() => {
            try {
              localStorage.setItem("pivot_last_checkin_date", new Date().toISOString().slice(0, 10));
              window.dispatchEvent(new Event("pivot:checkin-updated"));
            } catch {}
            setReadinessDraft(null);
            setWorkoutState("WORKOUT_GENERATED");
            if (!hasGeneratedWorkout) setHasGeneratedWorkout(true);
            setHomeFlow("home");
          }}
        />
      );
    }

    if (homeFlow === "workout") {
      return (
        <WorkoutScreen
          mode="active"
          onBack={() => setHomeFlow("home")}
          onComplete={() => {
            finalizeSessionQuality();
            incrementCompletedWorkouts(todayWorkout?.duration ?? 0, todayWorkout?.focus ?? "");
            setWorkoutState("WORKOUT_COMPLETED");
            clearExerciseStatuses();
            setReturning(false);
            setHomeFlow("home");
            toast.success("Workout logged");
          }}
        />
      );
    }

    if (homeFlow === "workout-preview") {
      return (
        <WorkoutScreen
          mode="preview"
          onBack={() => setHomeFlow("home")}
          onComplete={() => {
            clearExerciseStatuses();
            setWorkoutState("WORKOUT_STARTED");
            setHomeFlow("workout");
          }}
        />
      );
    }

    return (
      <HomeScreen
        onStartCheckIn={() => setHomeFlow("checkin")}
        onStartWorkout={() => {
          clearExerciseStatuses();
          setWorkoutState("WORKOUT_STARTED");
          setHomeFlow("workout");
        }}
        onContinueWorkout={() => setHomeFlow("workout")}
        onViewWorkout={() => setHomeFlow("workout-preview")}
      />
    );
  };

  const showNav = !(tab === "home" && homeFlow !== "home");

  return (
    <MobileFrame>
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {tab === "home" && renderHomeFlow()}
        {tab === "insights" && <InsightsScreen />}
        {tab === "profile" && <ProfileScreen />}
      </main>
      {showNav && <BottomNav />}
    </MobileFrame>
  );
}

const Index = () => (
  <AppProvider>
    <PivotApp />
  </AppProvider>
);

export default Index;
