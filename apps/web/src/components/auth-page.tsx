"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth.store";

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu phải từ 6 ký tự"),
  remember: z.boolean().default(false),
});

const registerSchema = z.object({
  fullName: z.string().min(2, "Họ và tên phải từ 2 ký tự"),
  email: z.string().email("Email không hợp lệ"),
  phone: z.string().regex(/^(0[3|5|7|8|9])+([0-9]{8})$/, "Số điện thoại Việt Nam không hợp lệ"),
  password: z.string().min(8, "Mật khẩu phải từ 8 ký tự"),
  confirmPassword: z.string().min(8, "Xác nhận mật khẩu phải từ 8 ký tự"),
  role: z.enum(["provider", "receiver", "volunteer"]),
  
  // Provider fields
  storeName: z.string().optional(),
  foodCategory: z.string().optional(),
  providerAddress: z.string().optional(),
  
  // Volunteer fields
  vehicle: z.string().optional(),
  supportArea: z.string().optional(),
  
  // Receiver fields
  receiverAddress: z.string().optional(),
  notes: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp",
  path: ["confirmPassword"],
}).superRefine((data, ctx) => {
  if (data.role === "provider") {
    if (!data.storeName || data.storeName.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Tên cửa hàng phải từ 2 ký tự",
        path: ["storeName"],
      });
    }
    if (!data.providerAddress || data.providerAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Địa chỉ hoạt động phải từ 5 ký tự",
        path: ["providerAddress"],
      });
    }
  } else if (data.role === "volunteer") {
    if (!data.supportArea || data.supportArea.trim().length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Vui lòng nhập quận/huyện hỗ trợ",
        path: ["supportArea"],
      });
    }
  } else if (data.role === "receiver") {
    if (!data.receiverAddress || data.receiverAddress.trim().length < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Địa chỉ nhận hỗ trợ phải từ 5 ký tự",
        path: ["receiverAddress"],
      });
    }
  }
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;

interface AuthPageProps {
  initialTab: "login" | "register";
}

export default function AuthPage({ initialTab }: AuthPageProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">(initialTab);
  const [registerStep, setRegisterStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const router = useRouter();

  // 1. Login form setup
  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors: loginErrors },
    reset: resetLoginForm,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      remember: false,
    },
  });

  // 2. Register form setup
  const {
    register: registerSignup,
    handleSubmit: handleRegisterSubmit,
    formState: { errors: registerErrors },
    setValue: setRegisterValue,
    watch: watchRegister,
    reset: resetRegisterForm,
    trigger,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "receiver",
      storeName: "",
      foodCategory: "Đồ tươi sống",
      providerAddress: "",
      vehicle: "Xe máy",
      supportArea: "",
      receiverAddress: "",
      notes: "",
    },
  });

  const selectedRole = watchRegister("role");

  const handleNextStep = async () => {
    // Validate Step 1 fields before proceeding
    const isValid = await trigger(["fullName", "email", "phone", "password", "confirmPassword", "role"]);
    if (isValid) {
      setRegisterStep(2);
    }
  };

  const { setTokens, setUser } = useAuthStore();

  const onLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const res = await api.post<{
        data: {
          accessToken: string;
          refreshToken: string;
          user: Parameters<typeof setUser>[0];
        };
      }>('/auth/login', { email: data.email, password: data.password });
      setTokens(res.data.data.accessToken, res.data.data.refreshToken);
      setUser(res.data.data.user);
      toast.success("Đăng nhập thành công!");
      router.push("/listings");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Đăng nhập thất bại. Kiểm tra lại email hoặc mật khẩu.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onRegisterSubmit = async (data: RegisterFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await api.post('/auth/register', {
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        phone: data.phone,
        role: data.role,
      });
      setSuccessMessage("Đăng ký tài khoản thành công! Bạn có thể đăng nhập ngay.");
      toast.success("Đăng ký thành công!");
      setTimeout(() => {
        setActiveTab("login");
        setRegisterStep(1);
        resetLoginForm();
        resetRegisterForm();
        setUploadedFile(null);
        setSuccessMessage(null);
      }, 1500);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message ?? "Đăng ký thất bại. Email hoặc số điện thoại có thể đã được sử dụng.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col md:flex-row bg-surface">
      {/* Left Section: Visual & Branding (60% Desktop) */}
      <section className="relative hidden md:flex md:w-[60%] lg:w-[65%] min-h-screen items-center justify-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            alt="Friendly Bakery"
            className="w-full h-full object-cover"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDDhq1Fly7FtAtk6JjL7x3SSYsGKCiFo2Qxp2OYGYZa59Guab_dPnBOL5MLdqDBcdiCOi2HlT7NgndHTz3XocA3f0tAWc01oiul3OZBR-gxTHI8L1GGY-iyUmXIG_e9HxrYJqlihHln2mwzrO-g49jZreyImS2VYkdTgQ123TKE7BWI7Pu904JrrmMycFxyZh6BpD8F_RbjNpR3whR-8jYOVXrQg8vVP1-m3l84qohZRXsYvVflYKDUolGe1lHqWbaMLDk6PEJ2UXT5"
          />
          {/* Soft Green Overlay */}
          <div className="absolute inset-0 bg-primary/20 backdrop-blur-[2px]"></div>
          {/* Gradient Fade */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent to-surface/40"></div>
        </div>
        
        {/* Branding and Value Proposition */}
        <div className="relative z-10 p-xl max-w-[576px] text-white drop-shadow-lg">
          <div className="mb-lg">
            <h1 className="font-headline-lg text-headline-lg text-primary-container italic tracking-tight">FoodResQ</h1>
            <div className="h-1 w-16 bg-primary-container rounded-full mt-2"></div>
          </div>
          <h2 className="font-headline-lg text-headline-lg mb-md leading-tight">Mọi bữa ăn đều đáng trân trọng.</h2>
          <p className="font-body-lg text-body-lg opacity-90 leading-relaxed">
            Tham gia cùng hàng ngàn người hàng xóm chia sẻ thực phẩm dư thừa, giảm thiểu lãng phí và xây dựng một cộng đồng gắn kết hơn.
          </p>
          
          {/* Community Progress Snippet */}
          <div className="mt-xl p-lg bg-white/10 backdrop-blur-md rounded-xl border border-white/20 inline-block w-full max-w-sm">
            <div className="flex items-center gap-md mb-sm">
              <span className="material-symbols-outlined text-primary-container" style={{ fontVariationSettings: "'FILL' 1" }}>
                volunteer_activism
              </span>
              <span className="font-label-lg text-label-lg">12,450+ bữa ăn đã được cứu</span>
            </div>
            <div className="w-full bg-white/20 h-3 rounded-full overflow-hidden">
              <div 
                className="bg-primary-container h-full rounded-full shadow-[0_0_15px_rgba(157,234,152,0.5)] transition-all duration-1000"
                style={{ width: "85%" }}
              ></div>
            </div>
          </div>
        </div>
      </section>

      {/* Right Section: Authentication Form (40% Desktop) */}
      <section className="flex-1 bg-surface flex flex-col px-container-margin md:px-xl py-xl justify-center items-center overflow-y-auto">
        <div className="w-full max-w-[440px] my-auto">
          {/* Mobile Branding (Logo only visible on mobile) */}
          <div className="md:hidden mb-xl text-center">
            <h1 className="font-headline-lg text-headline-lg text-primary italic tracking-tight">FoodResQ</h1>
            <p className="text-on-surface-variant text-label-lg mt-xs">Kết nối cộng đồng, giảm thiểu lãng phí</p>
          </div>

          {/* Form Header & Toggle */}
          <div className="mb-8">
            <h2 className="font-headline-md text-headline-md text-on-surface mb-2">
              {activeTab === "login" ? "Chào mừng bạn!" : "Đăng ký thành viên"}
            </h2>
            <p className="text-on-surface-variant font-body-md mb-6">
              {activeTab === "login" 
                ? "Hãy bắt đầu hành trình chia sẻ thực phẩm ngay hôm nay." 
                : "Tạo tài khoản để tham gia mạng lưới cứu trợ thực phẩm."}
            </p>
            
            {/* Toggle Switch */}
            <div className="flex p-1 bg-surface-container-low rounded-full border border-outline-variant/30 relative">
              <button
                type="button"
                className={`flex-1 py-2.5 font-label-lg text-label-lg rounded-full transition-all duration-300 relative z-10 ${
                  activeTab === "login" ? "text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"
                }`}
                onClick={() => {
                  setActiveTab("login");
                  setRegisterStep(1);
                  setUploadedFile(null);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 font-label-lg text-label-lg rounded-full transition-all duration-300 relative z-10 ${
                  activeTab === "register" ? "text-primary font-bold" : "text-on-surface-variant hover:text-on-surface"
                }`}
                onClick={() => {
                  setActiveTab("register");
                  setRegisterStep(1);
                  setUploadedFile(null);
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
              >
                Đăng ký
              </button>
              
              {/* Sliding Background Indicator */}
              <motion.div
                layoutId="activeTabIndicator"
                className="absolute top-1 bottom-1 left-1 rounded-full bg-white shadow-sm border border-outline-variant/10"
                style={{ width: "calc(50% - 4px)" }}
                animate={{ x: activeTab === "login" ? 0 : "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            </div>
          </div>

          {/* Error and Success Alerts */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-md p-md bg-error-container text-on-error-container text-label-lg rounded-xl flex items-start gap-sm border border-error/20"
              >
                <span className="material-symbols-outlined text-error">error</span>
                <span>{errorMessage}</span>
              </motion.div>
            )}
            
            {successMessage && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="mb-md p-md bg-primary-container text-on-primary-container text-label-lg rounded-xl flex items-start gap-sm border border-primary/20"
              >
                <span className="material-symbols-outlined text-primary">check_circle</span>
                <span>{successMessage}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Auth Form Container with Switch Animation */}
          <div className="relative overflow-hidden min-h-[300px]">
            <AnimatePresence mode="wait">
              {activeTab === "login" ? (
                <motion.form
                  key="login-form"
                  onSubmit={handleLoginSubmit(onLoginSubmit)}
                  className="space-y-5"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Input: Email/Username */}
                  <div className="space-y-1.5">
                    <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="login-email">
                      Email
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                        mail
                      </span>
                      <input
                        id="login-email"
                        type="email"
                        placeholder="example@email.com"
                        className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                          loginErrors.email ? "border-error" : "border-outline-variant/30"
                        }`}
                        disabled={isSubmitting}
                        {...registerLogin("email")}
                      />
                    </div>
                    {loginErrors.email && (
                      <p className="text-error text-label-sm ml-1 mt-xs">{loginErrors.email.message}</p>
                    )}
                  </div>

                  {/* Input: Password */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center px-1">
                      <label className="font-label-lg text-label-lg text-on-surface-variant" htmlFor="login-password">
                        Mật khẩu
                      </label>
                      <a className="font-label-sm text-label-sm text-primary font-bold hover:underline" href="#">
                        Quên mật khẩu?
                      </a>
                    </div>
                    <div className="relative">
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                        lock
                      </span>
                      <input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="••••••••"
                        className={`w-full pl-12 pr-12 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                          loginErrors.password ? "border-error" : "border-outline-variant/30"
                        }`}
                        disabled={isSubmitting}
                        {...registerLogin("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface transition-colors"
                      >
                        <span className="material-symbols-outlined select-none">
                          {showPassword ? "visibility_off" : "visibility"}
                        </span>
                      </button>
                    </div>
                    {loginErrors.password && (
                      <p className="text-error text-label-sm ml-1 mt-xs">{loginErrors.password.message}</p>
                    )}
                  </div>

                  {/* Remember Me */}
                  <div className="flex items-center gap-2.5 px-1 py-0.5">
                    <input
                      id="remember"
                      type="checkbox"
                      className="w-5 h-5 rounded border-2 border-outline-variant text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                      disabled={isSubmitting}
                      {...registerLogin("remember")}
                    />
                    <label className="font-body-md text-on-surface-variant select-none cursor-pointer" htmlFor="remember">
                      Ghi nhớ đăng nhập
                    </label>
                  </div>

                  {/* Primary Action */}
                  <button
                    type="submit"
                    className="squishy-button w-full py-3 bg-primary-container text-on-primary-container font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5 mr-2"></span>
                        Đang đăng nhập...
                      </>
                    ) : (
                      <>
                        Đăng nhập
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.form
                  key="register-form"
                  onSubmit={handleRegisterSubmit(onRegisterSubmit)}
                  className="space-y-4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Progress Indicator */}
                  <div className="flex items-center justify-between mb-6 px-1 text-sm">
                    <div className={`flex items-center gap-2 ${registerStep === 1 ? "text-primary font-bold" : "text-on-surface-variant/70"}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${registerStep === 1 ? "bg-primary text-white" : "bg-primary-container text-on-primary-container"}`}>1</span>
                      <span>Tài khoản & Vai trò</span>
                    </div>
                    <div className="flex-1 h-0.5 mx-3 bg-outline-variant/30"></div>
                    <div className={`flex items-center gap-2 ${registerStep === 2 ? "text-primary font-bold" : "text-on-surface-variant/70"}`}>
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${registerStep === 2 ? "bg-primary text-white" : "bg-surface-container text-on-surface-variant"}`}>2</span>
                      <span>Thông tin chi tiết</span>
                    </div>
                  </div>

                  {registerStep === 1 ? (
                    <>
                      {/* Step 1 Fields */}
                      {/* Input: Full Name */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="reg-fullname">
                          Họ và tên
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            person
                          </span>
                          <input
                            id="reg-fullname"
                            type="text"
                            placeholder="Nguyễn Văn A"
                            className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                              registerErrors.fullName ? "border-error" : "border-outline-variant/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("fullName")}
                          />
                        </div>
                        {registerErrors.fullName && (
                          <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.fullName.message}</p>
                        )}
                      </div>

                      {/* Input: Email */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="reg-email">
                          Email
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            mail
                          </span>
                          <input
                            id="reg-email"
                            type="email"
                            placeholder="example@email.com"
                            className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                              registerErrors.email ? "border-error" : "border-outline-variant/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("email")}
                          />
                        </div>
                        {registerErrors.email && (
                          <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.email.message}</p>
                        )}
                      </div>

                      {/* Input: Phone */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="reg-phone">
                          Số điện thoại
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            call
                          </span>
                          <input
                            id="reg-phone"
                            type="text"
                            placeholder="0912345678"
                            className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                              registerErrors.phone ? "border-error" : "border-outline-variant/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("phone")}
                          />
                        </div>
                        {registerErrors.phone && (
                          <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.phone.message}</p>
                        )}
                      </div>

                      {/* Input: Role Selection */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1">
                          Vai trò tham gia
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "receiver")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-surface-container-low text-center ${
                              selectedRole === "receiver" 
                                ? "border-primary bg-primary/5 text-primary" 
                                : "border-outline-variant/30 text-on-surface-variant"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">person_pin</span>
                            <span className="font-label-sm text-[11px] leading-tight font-semibold">Người Nhận</span>
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "provider")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-surface-container-low text-center ${
                              selectedRole === "provider" 
                                ? "border-primary bg-primary/5 text-primary" 
                                : "border-outline-variant/30 text-on-surface-variant"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">storefront</span>
                            <span className="font-label-sm text-[11px] leading-tight font-semibold">Cửa Hàng</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRegisterValue("role", "volunteer")}
                            className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all hover:bg-surface-container-low text-center ${
                              selectedRole === "volunteer" 
                                ? "border-primary bg-primary/5 text-primary" 
                                : "border-outline-variant/30 text-on-surface-variant"
                            }`}
                            disabled={isSubmitting}
                          >
                            <span className="material-symbols-outlined mb-1">volunteer_activism</span>
                            <span className="font-label-sm text-[11px] leading-tight font-semibold">Tình Nguyện</span>
                          </button>
                        </div>
                      </div>

                      {/* Input: Password */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="reg-password">
                          Mật khẩu
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            lock
                          </span>
                          <input
                            id="reg-password"
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className={`w-full pl-12 pr-12 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                              registerErrors.password ? "border-error" : "border-outline-variant/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("password")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface transition-colors"
                          >
                            <span className="material-symbols-outlined select-none">
                              {showPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                        {registerErrors.password && (
                          <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.password.message}</p>
                        )}
                      </div>

                      {/* Input: Confirm Password */}
                      <div className="space-y-1.5">
                        <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="reg-confirmpass">
                          Xác nhận mật khẩu
                        </label>
                        <div className="relative">
                          <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                            lock
                          </span>
                          <input
                            id="reg-confirmpass"
                            type={showConfirmPassword ? "text" : "password"}
                            placeholder="••••••••"
                            className={`w-full pl-12 pr-12 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                              registerErrors.confirmPassword ? "border-error" : "border-outline-variant/30"
                            }`}
                            disabled={isSubmitting}
                            {...registerSignup("confirmPassword")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-on-surface transition-colors"
                          >
                            <span className="material-symbols-outlined select-none">
                              {showConfirmPassword ? "visibility_off" : "visibility"}
                            </span>
                          </button>
                        </div>
                        {registerErrors.confirmPassword && (
                          <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.confirmPassword.message}</p>
                        )}
                      </div>

                      {/* Next Button */}
                      <button
                        type="button"
                        onClick={handleNextStep}
                        className="squishy-button w-full py-3 bg-primary-container text-on-primary-container font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 mt-2"
                      >
                        Tiếp tục
                        <span className="material-symbols-outlined">arrow_forward</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Step 2: Role Specific Form */}
                      {selectedRole === "provider" && (
                        <div className="space-y-4">
                          {/* Store Name */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="store-name">
                              Tên cửa hàng/doanh nghiệp
                            </label>
                            <input
                              id="store-name"
                              type="text"
                              placeholder="Ví dụ: Bakery Fresh"
                              className={`w-full px-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                                registerErrors.storeName ? "border-error" : "border-outline-variant/30"
                              }`}
                              disabled={isSubmitting}
                              {...registerSignup("storeName")}
                            />
                            {registerErrors.storeName && (
                              <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.storeName.message}</p>
                            )}
                          </div>

                          {/* Food Category */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="food-category">
                              Loại thực phẩm chính
                            </label>
                            <select
                              id="food-category"
                              className="w-full px-4 py-3 bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none appearance-none"
                              disabled={isSubmitting}
                              {...registerSignup("foodCategory")}
                            >
                              <option value="Đồ tươi sống">Đồ tươi sống</option>
                              <option value="Bánh mì & Bánh ngọt">Bánh mì & Bánh ngọt</option>
                              <option value="Đồ ăn đã chế biến">Đồ ăn đã chế biến</option>
                              <option value="Rau củ quả">Rau củ quả</option>
                            </select>
                          </div>

                          {/* Address */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="provider-address">
                              Địa chỉ hoạt động
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                location_on
                              </span>
                              <input
                                id="provider-address"
                                type="text"
                                placeholder="Số nhà, tên đường, quận/huyện..."
                                className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                                  registerErrors.providerAddress ? "border-error" : "border-outline-variant/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("providerAddress")}
                              />
                            </div>
                            {registerErrors.providerAddress && (
                              <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.providerAddress.message}</p>
                            )}
                          </div>

                          {/* Business License Upload */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1">
                              Giấy phép kinh doanh (Ảnh chụp)
                            </label>
                            <div className="relative">
                              <input
                                type="file"
                                id="license-upload"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    setUploadedFile(e.target.files[0].name);
                                  }
                                }}
                                className="hidden"
                                disabled={isSubmitting}
                              />
                              <label
                                htmlFor="license-upload"
                                className="border-2 border-dashed border-outline-variant/50 rounded-xl p-6 flex flex-col items-center justify-center bg-surface-container-low hover:bg-surface-container-high hover:border-primary/50 transition-all cursor-pointer group text-center"
                              >
                                <span className="material-symbols-outlined text-outline-variant group-hover:text-primary mb-2 transition-colors">
                                  cloud_upload
                                </span>
                                <span className="text-on-surface-variant font-label-lg text-label-lg">
                                  {uploadedFile ? uploadedFile : "Nhấn để tải lên hoặc kéo thả tệp"}
                                </span>
                                <span className="text-outline-variant text-xs mt-1">PNG, JPG tối đa 5MB</span>
                              </label>
                            </div>
                          </div>
                        </div>
                      )}

                      {selectedRole === "volunteer" && (
                        <div className="space-y-4">
                          {/* Vehicle */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="volunteer-vehicle">
                              Phương tiện di chuyển
                            </label>
                            <select
                              id="volunteer-vehicle"
                              className="w-full px-4 py-3 bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none appearance-none"
                              disabled={isSubmitting}
                              {...registerSignup("vehicle")}
                            >
                              <option value="Xe máy">Xe máy</option>
                              <option value="Xe đạp">Xe đạp</option>
                              <option value="Ô tô">Ô tô</option>
                              <option value="Đi bộ">Đi bộ</option>
                            </select>
                          </div>

                          {/* Support Area */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="support-area">
                              Khu vực hỗ trợ hoạt động
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                my_location
                              </span>
                              <input
                                id="support-area"
                                type="text"
                                placeholder="Quận/Huyện hoặc địa bàn mong muốn..."
                                className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                                  registerErrors.supportArea ? "border-error" : "border-outline-variant/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("supportArea")}
                              />
                            </div>
                            {registerErrors.supportArea && (
                              <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.supportArea.message}</p>
                            )}
                          </div>
                        </div>
                      )}

                      {selectedRole === "receiver" && (
                        <div className="space-y-4">
                          {/* Receiver Address */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="receiver-address">
                              Địa chỉ nhận hỗ trợ
                            </label>
                            <div className="relative">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-outline-variant">
                                home
                              </span>
                              <input
                                id="receiver-address"
                                type="text"
                                placeholder="Số nhà, tên đường, quận/huyện..."
                                className={`w-full pl-12 pr-4 py-3 bg-surface-container-lowest border-2 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant ${
                                  registerErrors.receiverAddress ? "border-error" : "border-outline-variant/30"
                                }`}
                                disabled={isSubmitting}
                                {...registerSignup("receiverAddress")}
                              />
                            </div>
                            {registerErrors.receiverAddress && (
                              <p className="text-error text-label-sm ml-1 mt-xs">{registerErrors.receiverAddress.message}</p>
                            )}
                          </div>

                          {/* Notes */}
                          <div className="space-y-1.5">
                            <label className="font-label-lg text-label-lg text-on-surface-variant ml-1" htmlFor="notes">
                              Hoàn cảnh / Ghi chú thêm (Tùy chọn)
                            </label>
                            <textarea
                              id="notes"
                              rows={3}
                              placeholder="Ví dụ: Sinh viên nghèo, người lao động tự do, v.v."
                              className="w-full px-4 py-3 bg-surface-container-lowest border-2 border-outline-variant/30 rounded-xl focus:ring-0 focus:border-primary transition-all font-body-md outline-none placeholder:text-outline-variant resize-none"
                              disabled={isSubmitting}
                              {...registerSignup("notes")}
                            />
                          </div>
                        </div>
                      )}

                      {/* Navigation buttons */}
                      <div className="flex gap-4 pt-2">
                        <button
                          type="button"
                          onClick={() => setRegisterStep(1)}
                          className="flex-1 py-3 border-2 border-outline-variant/30 rounded-full font-bold text-on-surface hover:bg-surface-container-low transition-colors"
                        >
                          Quay lại
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting}
                          className="flex-[2] squishy-button py-3 bg-primary-container text-on-primary-container font-bold text-lg rounded-full shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isSubmitting ? (
                            <>
                              <span className="animate-spin border-2 border-primary border-t-transparent rounded-full w-5 h-5 mr-2"></span>
                              Đang đăng ký...
                            </>
                          ) : (
                            <>
                              Hoàn tất
                              <span className="material-symbols-outlined">check</span>
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </motion.form>
              )}
            </AnimatePresence>
          </div>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-outline-variant/30"></div>
            </div>
            <div className="relative flex justify-center text-label-sm">
              <span className="bg-surface px-3 text-on-surface-variant font-medium">Hoặc tiếp tục với</span>
            </div>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-2 gap-4">
            <button 
              type="button"
              className="squishy-button flex items-center justify-center gap-2 py-3 border-2 border-outline-variant/30 rounded-xl bg-white hover:bg-surface-container-low transition-colors"
            >
              <img
                alt="Google"
                className="w-5 h-5"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBn3AKiR8i1e9RW7aMctVNXB-EOytwqjeutvRIqK52MHa5A07Jc38EDO99hLBJloim7BuqP8shDsWpb5DpUadakNcxRHw9i1kXLPJcFA0EXTBwPJktqTRQbJpPt84lv-F5beXxJPLtlon_zbESO4Ax31F331vJ78Wlk7uX6gnn0ieFEJZpMHxgsoTD-al9R_cJD0YOyVxipQmSUcvnpG6DlRFcVmCFx5EH1T9f4TvzYXiTQzqQd46u6tfVTM76f0qLNfElm2MhSF_vT"
              />
              <span className="font-label-lg text-label-lg">Google</span>
            </button>
            <button 
              type="button"
              className="squishy-button flex items-center justify-center gap-2 py-3 border-2 border-outline-variant/30 rounded-xl bg-white hover:bg-surface-container-low transition-colors"
            >
              <img
                alt="Facebook"
                className="w-5 h-5"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuDuKbqZASyY96fbDYBxwezjj--7xfyRgGVGE2z7rlKSLfUG57qcyl2nhhaVpv3nt7NdJ0MeDoU8UP_jNPREHPszwxt9OQmhR-XUZFra1qEzDBt6cYf3R0ac7YSw8OxxQEI03qBHCAwCERNH6ZpBstkZgCIwI5NLE20wJ38_gljn1F8GeZaBt7K9cqmQG_iWhbulv8hUyM4gbs229jkp2mE3trI5Rxw_ljoCS9Fx5SSgc98fC4saxj4AjpKapTubq_t0IXaVpOl2gHGt"
              />
              <span className="font-label-lg text-label-lg">Facebook</span>
            </button>
          </div>

          {/* Footer Terms */}
          <p className="mt-8 text-center text-label-sm text-on-surface-variant leading-relaxed px-4">
            Bằng cách đăng nhập, bạn đồng ý với{" "}
            <a className="text-primary font-bold hover:underline" href="#">
              Điều khoản dịch vụ
            </a>{" "}
            và{" "}
            <a className="text-primary font-bold hover:underline" href="#">
              Chính sách bảo mật
            </a>{" "}
            của FoodResQ.
          </p>
        </div>
      </section>

      {/* Mobile Footer */}
      <footer className="bg-surface-container-lowest border-t border-outline-variant/20 py-lg md:hidden">
        <div className="flex flex-col items-center gap-md px-container-margin">
          <span className="font-body-md text-secondary">© 2026 Chia Sẻ - Kết nối cộng đồng</span>
          <div className="flex gap-lg">
            <a className="text-label-lg text-on-surface-variant hover:text-primary" href="#">
              Liên hệ
            </a>
            <a className="text-label-lg text-on-surface-variant hover:text-primary" href="#">
              Hướng dẫn
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
