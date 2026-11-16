package com.spotmedating.android;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.os.Build;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.WindowInsets;
import android.widget.*;
import com.android.billingclient.api.*;
import org.json.JSONObject;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public final class MainActivity extends Activity implements PurchasesUpdatedListener {
    private static final String PRODUCT = "spotme_premium";
    private static final int BLUE = 0xff2563eb, INK = 0xff111827;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Map<String, ProductDetails.SubscriptionOfferDetails> offers = new HashMap<>();
    private MemberApi api;
    private BillingClient billing;
    private ProductDetails details;
    private LinearLayout content, signIn, plans, gymArea, results;
    private EditText email, password, gymName, minAge, maxAge;
    private Spinner cities;
    private TextView status, selectedGym;
    private Button week, month, restore, signOut, submit, browse;
    private String[] cityIds = {};
    private String gym = "", account = "";
    private boolean signedIn, enabled, active, syncing, launching, connecting, restoring, destroyed;
    private int session, directoryRequest, cardRequest;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        var scroll = new ScrollView(this);
        content = column();
        content.setBackgroundColor(0xfff4f5f7);
        int pad = dp(22);
        scroll.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                var bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                content.setPadding(pad + bars.left, pad + bars.top, pad + bars.right, pad + bars.bottom);
                return WindowInsets.CONSUMED;
            }
            content.setPadding(pad, pad, pad, pad);
            return insets;
        });
        scroll.addView(content);
        setContentView(scroll);
        text(content,"SpotMe",34);
        text(content,"Train. Match. Connect.",17);
        text(content,"Premium",24);
        text(content,"Find people at a gym who choose to be discovered there. Your dating preferences still apply.",16);
        status = text(content,"Sign in to see your Premium access.",16);
        status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        signIn = column(); content.addView(signIn);
        email = field(signIn,"Email",InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        password = field(signIn,"Password",InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        submit = button(signIn,"Sign in",true,this::signIn);
        plans = column(); content.addView(plans);
        week = button(plans,"Weekly plan",true,()->buy("weekly"));
        month = button(plans,"Monthly plan",true,()->buy("monthly"));
        text(plans,"Subscriptions renew until canceled. Google Play shows the total before you pay.",14);
        restore = button(content,"Restore Google Play purchases",false,this::restore);
        button(content,"Manage Google Play subscriptions",false,()->{
            try { startActivity(new Intent(Intent.ACTION_VIEW,
                Uri.parse("https://play.google.com/store/account/subscriptions?sku="+PRODUCT+"&package="+getPackageName()))); }
            catch (ActivityNotFoundException e) { status.setText("Open Google Play to manage your subscriptions."); }
        });
        signOut = button(content,"Sign out",false,this::signOut);
        gymArea = column(); content.addView(gymArea);
        text(gymArea,"Browse a gym",22);
        cities = new Spinner(this);
        cities.setContentDescription("Gym city");
        gymArea.addView(cities);
        gymName = field(gymArea,"Gym name",InputType.TYPE_CLASS_TEXT);
        button(gymArea,"Find gyms",false,this::findGyms);
        selectedGym = text(gymArea,"Choose a gym.",16);
        minAge = field(gymArea,"Minimum age",InputType.TYPE_CLASS_NUMBER);
        minAge.setText("18");
        maxAge = field(gymArea,"Maximum age",InputType.TYPE_CLASS_NUMBER);
        maxAge.setText("99");
        browse = button(gymArea,"Browse profiles",true,this::browse);
        results = column();gymArea.addView(results);
        update();
        try { api = new MemberApi(BuildConfig.SPOTME_API_ORIGIN); }
        catch (Exception e) { submit.setEnabled(false); status.setText("This build needs a SpotMe server configured."); }
    }

    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private LinearLayout column() {
        var view = new LinearLayout(this); view.setOrientation(LinearLayout.VERTICAL); return view;
    }
    private TextView text(LinearLayout target,String value,int size) {
        var view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(INK);
        view.setPadding(0,dp(6),0,dp(6)); target.addView(view); return view;
    }
    private EditText field(LinearLayout target,String title,int type) {
        var view = new EditText(this);
        view.setId(View.generateViewId());
        view.setInputType(type);
        view.setSingleLine();
        view.setSaveEnabled(false);
        text(target,title,14).setLabelFor(view.getId());
        target.addView(view);
        return view;
    }
    private Button button(LinearLayout target,String title,boolean primary,Runnable action) {
        var b = new Button(this); b.setText(title); b.setAllCaps(false);
        if (primary) { b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(BLUE)); b.setTextColor(Color.WHITE); }
        b.setOnClickListener(v->action.run()); target.addView(b); return b;
    }
    private void update() {
        signIn.setVisibility(signedIn ? View.GONE : View.VISIBLE);
        signOut.setVisibility(signedIn ? View.VISIBLE : View.GONE);
        plans.setVisibility(enabled && !active ? View.VISIBLE : View.GONE);
        restore.setVisibility(enabled ? View.VISIBLE : View.GONE);
        restore.setEnabled(!syncing && !launching && !restoring);
        week.setEnabled(offers.containsKey("weekly") && !syncing && !launching && !restoring);
        month.setEnabled(offers.containsKey("monthly") && !syncing && !launching && !restoring);
        gymArea.setVisibility(active ? View.VISIBLE : View.GONE);
        browse.setEnabled(!gym.isEmpty());
    }

    @FunctionalInterface private interface Call<T> { T run() throws Exception; }
    private <T> void run(Call<T> call, Consumer<T> done, Consumer<Exception> fail) {
        int expected = session;
        worker.execute(()->{
            try {
                T data = call.run();
                runOnUiThread(()->{ if (!destroyed && expected==session) done.accept(data); });
            } catch (Exception e) {
                runOnUiThread(()->{ if (!destroyed && expected==session) fail.accept(e); });
            }
        });
    }
    private void fail(Exception e) {
        if (e instanceof MemberApi.Failure f && f.status==401) {
            clearSession();
            status.setText("Sign in to continue.");
        } else status.setText("Couldn’t reach or verify SpotMe right now. Try again.");
    }
    private void signIn() {
        String address=email.getText().toString().trim(), pass=password.getText().toString();
        if(address.isEmpty() || pass.isEmpty()) { status.setText("Enter your email and password."); return; }
        submit.setEnabled(false);
        run(()->api.request("/browser/sign-in",new JSONObject().put("email",address).put("password",pass)), reply->{
            submit.setEnabled(true);password.setText("");signedIn=true;update();refresh(true);
        }, e->{submit.setEnabled(true);password.setText("");status.setText("Sign-in didn’t succeed. Check your email and password, then try again.");});
    }
    private void clearSession() {
        session++;signedIn=false;enabled=false;active=false;syncing=false;launching=false;connecting=false;restoring=false;account="";gym="";
        offers.clear();details=null;cityIds=new String[0];cities.setAdapter(null);results.removeAllViews();
        selectedGym.setText("Choose a gym.");gymName.setText("");minAge.setText("18");maxAge.setText("99");
        if(billing!=null){ billing.endConnection();billing=null; }
        update();
    }
    private void signOut() {
        run(()->api.request("/browser/sign-out",new JSONObject()), ignored->{}, ignored->{});
        clearSession();
        status.setText("Signed out.");
    }
    private void apply(JSONObject data) {
        boolean wasActive=active;
        enabled=data.optBoolean("enabled");active=data.optBoolean("active");
        account=data.optString("accountToken");
        status.setText(active?"Premium is active on your SpotMe account.":enabled?"Choose a plan or restore a purchase.":"Google Play checkout is unavailable right now.");
        update();
        if(active && (!wasActive || cityIds.length==0)) loadCities();
        if(!active && wasActive) { directoryRequest++;cardRequest++;results.removeAllViews(); }
    }
    private void refresh(boolean sync) {
        if(!signedIn)return;
        run(()->api.request("/v1/me/play-billing",null),data->{
            apply(data);
            if(enabled && sync) connect(true);
        },this::fail);
    }

    private void connect(boolean sync) {
        if(syncing || launching || connecting || restoring)return;
        if(billing==null) {
            billing=BillingClient.newBuilder(this).setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection().build();
        }
        if(billing.isReady()) { if(!active)loadPlans(); if(sync)queryPurchases(); return; }
        connecting=true;
        int expected=session;
        billing.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                runOnUiThread(()->{
                    if(destroyed||expected!=session)return;
                    connecting=false;
                    if(ok(result)) { if(!active)loadPlans(); if(sync)queryPurchases(); }
                    else status.setText("Google Play is unavailable. Try restoring again.");
                });
            }
            @Override public void onBillingServiceDisconnected() {}
        });
    }
    private static boolean ok(BillingResult result) { return result.getResponseCode()==BillingClient.BillingResponseCode.OK; }
    private void loadPlans() {
        int expected=session;
        var products = QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(
            QueryProductDetailsParams.Product.newBuilder().setProductId(PRODUCT).setProductType(BillingClient.ProductType.SUBS).build())).build();
        billing.queryProductDetailsAsync(products,(result,list)-> runOnUiThread(()->{
            if(destroyed||expected!=session) return;
            offers.clear(); details=null;
            if(ok(result) && !list.getProductDetailsList().isEmpty()) {
                details=list.getProductDetailsList().get(0);
                var options=details.getSubscriptionOfferDetails();
                if(options!=null) for(var entry : options) {
                    boolean weekly=entry.getBasePlanId().equals("weekly"), monthly=entry.getBasePlanId().equals("monthly");
                    if(entry.getOfferId()!=null || !(weekly||monthly))continue;
                    var phases=entry.getPricingPhases().getPricingPhaseList();
                    if(phases.size()!=1 || !phases.get(0).getBillingPeriod().equals(weekly?"P1W":"P1M")
                        || phases.get(0).getRecurrenceMode()!=ProductDetails.RecurrenceMode.INFINITE_RECURRING)continue;
                    offers.put(entry.getBasePlanId(),entry);
                    (weekly ? week : month).setText(phases.get(0).getFormattedPrice()+(weekly?" / week":" / month"));
                }
            }
            if(offers.isEmpty()&&!active) status.setText("No Google Play plans are available for this account.");
            update();
        }));
    }
    private void buy(String plan) {
        if(launching || syncing || restoring || active || !enabled || details==null || account.isEmpty())return;
        var offer=offers.get(plan);
        if(offer==null)return;
        var products=BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(details)
            .setOfferToken(offer.getOfferToken()).build();
        launching=true;update();
        var result=billing.launchBillingFlow(this,BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(products)).setObfuscatedAccountId(account).build());
        if(!ok(result)) {
            launching=false;update();
            if(result.getResponseCode()==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
            else status.setText("Google Play checkout couldn’t open. Try again.");
        }
    }
    private void restore() { if(signedIn && enabled)connect(true); }
    private void queryPurchases() {
        int expected=session;
        restoring=true;update();
        billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
            (result,purchases)->runOnUiThread(()->{
                if(destroyed||expected!=session)return;
                restoring=false;update();
                if(ok(result)) processPurchases(purchases,false);
                else status.setText("Couldn’t restore purchases from Google Play.");
            }));
    }
    @Override public void onPurchasesUpdated(BillingResult result,List<Purchase> purchases) {
        runOnUiThread(()->{
            if(destroyed || !signedIn || !enabled)return;
            launching=false;update();
            if(ok(result) && purchases!=null) processPurchases(purchases,true);
            else if(result.getResponseCode()==BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) restore();
            else if(result.getResponseCode()==BillingClient.BillingResponseCode.USER_CANCELED) status.setText("Checkout canceled.");
            else status.setText("Google Play checkout couldn’t finish.");
        });
    }
    private void processPurchases(List<Purchase> purchases,boolean fromCheckout) {
        if(syncing || !signedIn)return;
        boolean pending=purchases.stream().anyMatch(p->p.getProducts().contains(PRODUCT) && p.getPurchaseState()==Purchase.PurchaseState.PENDING);
        var tokens=new java.util.ArrayList<String>();
        for(var purchase:purchases) if(purchase.getProducts().contains(PRODUCT)
            && purchase.getPurchaseState()==Purchase.PurchaseState.PURCHASED) tokens.add(purchase.getPurchaseToken());
        syncing=true;update();
        run(()->{
            boolean mismatch=false;
            for(String token:tokens) {
                try { api.request("/v1/me/play-billing",new JSONObject().put("purchaseToken",token)); }
                catch (MemberApi.Failure e) { if(e.code.equals("subscription_account_mismatch"))mismatch=true;else throw e; }
            }
            var reply=api.request("/v1/me/play-billing",null);
            reply.put("mismatch",mismatch);
            return reply;
        }, reply->{
            syncing=false;apply(reply);
            if(!active && pending)status.setText("Google Play is waiting for payment. Access opens after confirmation.");
            else if(!active && reply.optBoolean("mismatch"))status.setText("This purchase belongs to a different SpotMe account.");
            else if(!active && fromCheckout)status.setText("Purchase submitted. Restore purchases to check again.");
        }, e->{syncing=false;update();fail(e);});
    }
    @Override protected void onResume() {
        super.onResume();
        if(signedIn && !launching && !syncing && !restoring)refresh(true);
    }
    @Override protected void onDestroy() {
        destroyed=true;if(billing!=null)billing.endConnection();worker.shutdownNow();super.onDestroy();
    }

    private void loadCities() {
        run(()->api.request("/v1/cities",null).getJSONArray("cities"), list->{
            if(!active)return;
            var names=new String[list.length()];
            cityIds=new String[list.length()];
            for(int i=0;i<list.length();i++){
                var c=list.optJSONObject(i);cityIds[i]=c.optString("id");names[i]=c.optString("name");
            }
            var adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_item,names);
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            cities.setAdapter(adapter);
        },this::fail);
    }
    private void findGyms() {
        int index=cities.getSelectedItemPosition();
        if(!active||index<0||index>=cityIds.length)return;
        gym="";selectedGym.setText("Choose a gym.");update();results.removeAllViews();
        int request=++directoryRequest;++cardRequest;
        String name=gymName.getText().toString().trim(), city=cityIds[index];
        if(name.length()>80){status.setText("Enter a shorter gym name.");return;}
        run(()->api.request("/v1/gyms?city="+Uri.encode(city)+"&q="+Uri.encode(name),null).getJSONArray("gyms"),list->{
            if(!active||request!=directoryRequest)return;
            if(list.length()==0)text(results,"No gyms found.",16);
            for(int i=0;i<list.length();i++){
                var item=list.optJSONObject(i);
                button(results,item.optString("name")+" · "+item.optString("street_address"),false,()->{
                    gym=item.optString("id");selectedGym.setText(item.optString("name"));update();++cardRequest;
                });
            }
        },this::fail);
    }
    private void browse() {
        int lo,hi;
        try {lo=Integer.parseInt(minAge.getText().toString());hi=Integer.parseInt(maxAge.getText().toString());}
        catch(NumberFormatException e){status.setText("Enter minimum and maximum ages.");return;}
        if(lo<18||hi>99||lo>hi){status.setText("Choose an age range between 18 and 99.");return;}
        if(gym.isEmpty() || !active)return;
        String query="/v1/premium/gym-cards?gym="+Uri.encode(gym)+"&min_age="+lo+"&max_age="+hi;
        renderPage(query,"",++cardRequest,false);
    }
    private void renderPage(String query,String after,int request,boolean more) {
        run(()->api.request(query+(after.isEmpty()?"":"&after="+Uri.encode(after)),null).getJSONArray("cards"),list->{
            if(!active||request!=cardRequest)return;
            if(!more)results.removeAllViews();
            if(list.length()==0&&!more)text(results,"No eligible profiles match these filters.",16);
            for(int i=0;i<list.length();i++){
                var profile=list.optJSONObject(i);if(profile==null)continue;
                text(results,profile.optString("name")+", "+profile.optString("age")+" · "+profile.optString("city"),21);
                for(String key:new String[]{"bio","intent","split"}) {
                    String value=profile.optString(key,"");if(!value.isEmpty())text(results,value,16);
                }
            }
            if(list.length()==20){
                String next=list.optJSONObject(19).optString("id");
                button(results,"More profiles",false,()->{
                    results.removeViewAt(results.getChildCount()-1);
                    renderPage(query,next,request,true);
                });
            }
        }, e->{if(e instanceof MemberApi.Failure f&&f.status==403)refresh(false);else fail(e);});
    }
}
